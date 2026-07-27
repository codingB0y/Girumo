import {
  connectInstance,
  logoutInstance,
  providerInstanceId,
} from "@/lib/evolution/client";
import { getInstance, updateInstanceStatus } from "@/lib/stores/instances";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const ACTIONS = ["connect", "disconnect", "refresh_qr"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

function canManageInstances(role: string) {
  return role === "owner" || role === "admin";
}

/**
 * Ações síncronas de ciclo de vida da instância.
 *
 * São leves e imediatas, por isso falam direto com a Evolution. Envio de
 * mensagem nunca entra aqui — vai para `engine_commands`, onde o worker aplica
 * pacing e caps anti-ban.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await getTenantContext(req);
    if (!canManageInstances(ctx.role)) {
      return Response.json({ error: "Sem permissao para gerenciar instancia." }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (!isAction(body.action)) {
      return Response.json({ error: "Acao invalida." }, { status: 400 });
    }
    const action = body.action;

    // Escopado por tenant: um id de outro tenant é 404, não 403 — não confirma
    // que a instância existe.
    const instance = await getInstance(ctx.tenantId, id);
    if (!instance) return Response.json({ error: "Instancia nao encontrada." }, { status: 404 });

    if (!instance.provider_instance_id) {
      return Response.json(
        { error: "Instancia ainda nao provisionada no provedor." },
        { status: 409 },
      );
    }

    const remoteName = instance.provider_instance_id || providerInstanceId(instance.id);

    if (action === "disconnect") {
      await logoutInstance(remoteName);
      await updateInstanceStatus({
        tenantId: ctx.tenantId,
        instanceId: instance.id,
        status: "disconnected",
      });
    } else {
      // connect e refresh_qr são a mesma chamada: a Evolution reemite o QR.
      // O código também chega por webhook; devolvê-lo aqui evita esperar o
      // próximo ciclo de emissão na primeira renderização.
      const { code } = await connectInstance(remoteName);
      if (code) {
        await updateInstanceStatus({
          tenantId: ctx.tenantId,
          instanceId: instance.id,
          status: "qr",
          qrCode: code,
        });
      }
    }

    await getSupabaseAdmin().from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: `instance.${action}`,
      message: `Acao ${action} na instancia ${instance.name}.`,
      metadata: { instance_id: instance.id },
    });

    // Devolve o estado fresco para o painel não precisar de um GET extra.
    return Response.json(await getInstance(ctx.tenantId, id));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao executar acao na instancia." }, { status: 502 });
  }
}
