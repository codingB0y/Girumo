import { assertPlanLimit } from "@/lib/billing/entitlements";
import {
  createInstance,
  deleteInstance,
  evolutionWebhookUrl,
  providerInstanceId,
  setWebhook,
} from "@/lib/evolution/client";
import { resolveSecret } from "@/lib/runtime-secrets";
import { deleteInstanceRow, listInstances, setProviderInstanceId } from "@/lib/stores/instances";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Janela do dedupe do log de provisionamento falho. Uma hora: curta o bastante
 * para uma queda nova da Evolution aparecer no mesmo dia em /admin/logs, longa
 * o bastante para uma sessao inteira de F5 na tela de conectar render uma linha.
 */
const LOG_DEDUPE_MS = 60 * 60 * 1000;

function canManageInstances(role: string) {
  return role === "owner" || role === "admin";
}

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    return Response.json(await listInstances(ctx.tenantId));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao listar instancias." }, { status: 500 });
  }
}

/**
 * Cria a instância no banco E na Evolution.
 *
 * As duas pontas precisam existir juntas: uma linha sem instância na Evolution
 * nunca receberia QR nem webhook, e uma instância na Evolution sem linha é
 * órfã que ninguém coleta. Qualquer falha no meio desfaz o que já foi feito.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    if (!canManageInstances(ctx.role)) {
      return Response.json({ error: "Sem permissao para criar instancia." }, { status: 403 });
    }

    await assertPlanLimit(ctx.tenantId, "instances:create");

    const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string };
    const name = String(body.name ?? "WhatsApp").trim().slice(0, 80) || "WhatsApp";
    const phone = String(body.phone ?? "").trim() || null;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("instances")
      .insert({
        tenant_id: ctx.tenantId,
        name,
        phone,
        status: "pending",
        provider: "evolution",
        metadata: {},
      })
      .select("id, name, phone, status, created_at")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // O id da linha é a fonte do nome na Evolution — por isso a linha vem
    // primeiro, e o provisionamento remoto depois.
    const remoteName = providerInstanceId(data.id);
    let remoteCreated = false;

    try {
      await createInstance(remoteName);
      remoteCreated = true;

      await setWebhook(
        remoteName,
        evolutionWebhookUrl(),
        resolveSecret(
          "EVOLUTION_WEBHOOK_SECRET",
          process.env.EVOLUTION_WEBHOOK_SECRET,
          process.env.NODE_ENV,
          "dev-evolution-webhook-secret",
        ),
      );

      await setProviderInstanceId(ctx.tenantId, data.id, remoteName);
    } catch (provisionError) {
      // Rollback na ordem inversa. Falhas aqui são registradas mas não mascaram
      // o erro original — o operador precisa ver a causa raiz.
      if (remoteCreated) {
        await deleteInstance(remoteName).catch(() => undefined);
      }
      await deleteInstanceRow(ctx.tenantId, data.id).catch(() => undefined);

      const motivo =
        provisionError instanceof Error ? provisionError.message : "desconhecido";
      console.error(
        `[api/instances] provisionamento falhou para ${ctx.tenantId}:`,
        motivo,
      );

      // Dedupe por janela antes de gravar. A tela /painel/conectar tenta
      // provisionar sozinha ao montar, entao com a Evolution fora cada visita
      // (e cada F5) rendia mais uma linha identica em `logs` — que e a tabela
      // por tras de /admin/logs. Em dev isso ja era 13 de 160 registros, todos
      // do mesmo defeito, sem um unico instance.created para contrapor.
      //
      // A primeira falha da janela continua registrada: o sinal fica, a
      // repeticao some. O console acima nao passa por este filtro, entao o
      // operador que estiver olhando o log do servidor ve todas as tentativas.
      const inicioDaJanela = new Date(Date.now() - LOG_DEDUPE_MS).toISOString();
      const { data: jaRegistrado, error: dedupeError } = await supabase
        .from("logs")
        .select("id")
        .eq("tenant_id", ctx.tenantId)
        .eq("event", "instance.provision_failed")
        .gte("created_at", inicioDaJanela)
        .limit(1);

      if (dedupeError) {
        console.error(
          "[api/instances] falha no dedupe do log de provisionamento:",
          dedupeError.message,
        );
      }

      // Falha no dedupe grava assim mesmo: perder o registro e pior que repetir.
      if (dedupeError || !jaRegistrado || jaRegistrado.length === 0) {
        const { error: logError } = await supabase.from("logs").insert({
          tenant_id: ctx.tenantId,
          actor_user_id: ctx.authUserId,
          level: "error",
          event: "instance.provision_failed",
          message: "Falha ao provisionar instancia na Evolution.",
          metadata: { instance_id: data.id, reason: motivo },
        });

        if (logError) {
          console.error(
            "[api/instances] provisionamento falhou e o log nao foi gravado:",
            logError.message,
          );
        }
      }

      return Response.json(
        { error: "Nao foi possivel provisionar a instancia no provedor." },
        { status: 502 },
      );
    }

    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: "instance.created",
      message: `Instancia ${name} criada.`,
      metadata: { instance_id: data.id },
    });

    return Response.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao criar instancia." }, { status: 500 });
  }
}
