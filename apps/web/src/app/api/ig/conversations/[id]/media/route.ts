import { lerAnexo, linkDeAnexoSeguro } from "@/lib/ig/conversas/fio";
import { carregarConversa, requireConversas, responderErroConversa, zernioDaLoja } from "@/lib/ig/conversas/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/ig/conversations/[id]/media?mid=&i= — pede o link novo do anexo e responde 302 para ele.
// Nunca passa os bytes pela função (limite de 4,5 MB da Vercel) e nunca expõe a URL antiga da Zernio.
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ctx = await requireConversas(req);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const anexo = lerAnexo(searchParams.get("mid"), searchParams.get("i"));
    if (!anexo) return Response.json({ error: "Anexo inválido." }, { status: 400 });
    const { conversa, accountId } = await carregarConversa(ctx.tenantId, id);
    const url = await zernioDaLoja().attachmentUrl({ conversationId: conversa.zernio_conversation_id, messageId: anexo.mid, index: anexo.indice, accountId });
    if (!linkDeAnexoSeguro(url)) return Response.json({ error: "O Instagram devolveu um link inesperado.", code: "zernio_erro" }, { status: 502 });
    // `private, no-store`: o link é assinado e expira; `no-referrer`: a tela da loja não vaza para o CDN.
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (e) {
    return responderErroConversa(e);
  }
}
