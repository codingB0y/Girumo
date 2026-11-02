import { assertPlanLimit } from "@/lib/billing/entitlements";
import {
  createInstance,
  deleteInstance,
  evolutionWebhookUrl,
  providerInstanceId,
  setWebhook,
} from "@/lib/evolution/client";
import { parseNumeroPerfil } from "@/lib/instances/numero-perfil";
import { reconciliarConexoes } from "@/lib/instances/reconciliar-conexao";
import { PRIVADO_SEM_ADDON, privadoLiberado } from "@/lib/privado/numero";
import { resolveSecret } from "@/lib/runtime-secrets";
import {
  deleteInstanceRow,
  listGroupInstances,
  setProviderInstanceId,
  type InstancePurpose,
} from "@/lib/stores/instances";
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

const NOME_PADRAO: Record<InstancePurpose, string> = { grupos: "WhatsApp", privado: "Atendimento" };

/** Código do Postgres para unique_violation (o PostgREST o repassa em `error.code`). */
const UNIQUE_VIOLATION = "23505";

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    // A tela de conectar pergunta aqui "já conectou?": sem conferir na Evolution,
    // um connection.update perdido deixava o número pareado aparecendo desconectado.
    // Só os números dos grupos: o do atendimento tem tela e rota próprias, e a tela Conectar nunca o lista.
    return Response.json(await reconciliarConexoes(await listGroupInstances(ctx.tenantId)));
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

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      phone?: string;
      numero_perfil?: unknown;
      purpose?: unknown;
    };
    const purpose = body.purpose === undefined ? "grupos" : body.purpose;
    if (purpose !== "grupos" && purpose !== "privado") {
      return Response.json({ error: "Tipo de número inválido." }, { status: 400 });
    }

    if (purpose === "privado") {
      // Vem com o add-on: não ocupa vaga do plano, então não passa por `assertPlanLimit`. Erro de
      // leitura sobe para o 500 do catch — na dúvida o número não é criado.
      if (!(await privadoLiberado(ctx.tenantId))) {
        return Response.json({ error: PRIVADO_SEM_ADDON, code: "privado_sem_addon" }, { status: 403 });
      }
    } else {
      await assertPlanLimit(ctx.tenantId, "instances:create");
    }

    const padrao = NOME_PADRAO[purpose];
    const name = String(body.name ?? padrao).trim().slice(0, 80) || padrao;
    // O telefone do atendimento vem do pareamento: um valor do cliente enfraqueceria a recusa do
    // chip repetido quando o `open` chega sem `wuid`.
    const phone = purpose === "privado" ? null : String(body.phone ?? "").trim() || null;

    // O perfil (novo/antigo) é pergunta do aquecimento dos grupos; o atendimento não tem.
    const perfil = purpose === "privado" ? { ok: true as const, value: null } : parseNumeroPerfil(body.numero_perfil);
    if (!perfil.ok) return Response.json({ error: perfil.error }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("instances")
      .insert({
        tenant_id: ctx.tenantId,
        name,
        phone,
        purpose,
        status: "pending",
        provider: "evolution",
        metadata: {},
        numero_perfil: perfil.value,
      })
      .select("id, name, phone, status, created_at")
      .single();

    // Clique duplo: o índice único `instances_one_privado_per_tenant` barra o segundo antes de existir
    // instância na Evolution (o insert vem primeiro).
    if (purpose === "privado" && error?.code === UNIQUE_VIOLATION) {
      return Response.json({ error: "Esta loja já tem um número do atendimento." }, { status: 409 });
    }
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
