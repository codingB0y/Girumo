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

      await supabase.from("logs").insert({
        tenant_id: ctx.tenantId,
        actor_user_id: ctx.authUserId,
        level: "error",
        event: "instance.provision_failed",
        message: "Falha ao provisionar instancia na Evolution.",
        metadata: {
          instance_id: data.id,
          reason: provisionError instanceof Error ? provisionError.message : "desconhecido",
        },
      });

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
