import { requireConversas, responderErroConversa } from "@/lib/ig/conversas/http";
import { isUuid } from "@/lib/ig/flow/body";
import { deleteCannedReply } from "@/lib/stores/ig-canned-replies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/ig/canned-replies/[id] — só dono ou admin. Id de outra loja = 404.
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const ctx = await requireConversas(req, { admin: true });
    const { id } = await params;
    if (!isUuid(id) || !(await deleteCannedReply(ctx.tenantId, id))) return Response.json({ error: "Resposta não encontrada." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return responderErroConversa(e);
  }
}
