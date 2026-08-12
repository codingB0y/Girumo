import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as broadcastsStore from "@/lib/stores/broadcasts";
import { cancelMessage } from "@/lib/messages-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { assertPermission } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/campanhas/[slug]/messages/cancel?id=xxx
export async function PATCH(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  // Legado (dev local, single-tenant): messages.json.
  if (!USE_SUPABASE) {
    const msg = await cancelMessage(id);
    if (!msg) return Response.json({ error: "Mensagem não encontrada." }, { status: 404 });
    return Response.json(msg);
  }

  // Produção: escopa por tenant do usuário autenticado (impede cancelar oferta de outro tenant).
  const ctx = await getRouteTenantContext(req, { allowEngine: false });
  if (!ctx.role) return Response.json({ error: "Sem permissão para esta ação." }, { status: 403 });
  assertPermission(ctx.role, "campaign:edit");

  const result = await broadcastsStore.cancelBroadcast(ctx.tenantId, id);
  if (!result) return Response.json({ error: "Oferta não encontrada." }, { status: 404 });

  // Diz a verdade: o que já saiu não volta. Só o que ainda estava na fila foi barrado.
  return Response.json({
    ok: true,
    canceledCommands: result.canceledCommands,
    alreadySent: result.alreadySent,
    message:
      result.alreadySent > 0
        ? `Cancelado o que ainda estava na fila. ${result.alreadySent} grupo(s) já haviam recebido.`
        : "Disparo cancelado.",
  });
}
