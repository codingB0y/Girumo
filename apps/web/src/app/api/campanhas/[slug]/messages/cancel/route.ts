import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as supaStore from "@/lib/stores/campaign-messages";
import { cancelMessage } from "@/lib/messages-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

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

  // Produção: escopa por tenant do usuário autenticado (impede cancelar msg de outro tenant).
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  const ok = await supaStore.cancelCampaignMessage(tenantId, id);
  if (!ok) return Response.json({ error: "Mensagem não encontrada." }, { status: 404 });
  return Response.json({ ok: true });
}
