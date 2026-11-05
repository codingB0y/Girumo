import { carregarConversa, requireConversas, responderErroConversa, zernioDaLoja } from "@/lib/ig/conversas/http";
import { updateConversation } from "@/lib/stores/ig-conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/ig/conversations/[id]/read — zera as não lidas e, só se havia, avisa a Zernio. A falha dela não desfaz o zero.
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ctx = await requireConversas(req);
    const { id } = await params;
    const { conversa, accountId } = await carregarConversa(ctx.tenantId, id);
    if (conversa.unread_count === 0) return Response.json({ ok: true });
    await updateConversation(ctx.tenantId, id, { unread_count: 0 });
    try {
      await zernioDaLoja().markRead({ conversationId: conversa.zernio_conversation_id, accountId });
    } catch (e) {
      // Só o tipo: a mensagem da Zernio pode trazer dado da conta.
      console.error("[ig/conversas] marcar lida falhou:", e instanceof Error ? e.name : typeof e);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return responderErroConversa(e);
  }
}
