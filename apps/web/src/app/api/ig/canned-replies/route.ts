import { z } from "zod";
import { corpoInvalido, requireConversas, responderErroConversa } from "@/lib/ig/conversas/http";
import { CANNED_REPLIES_LIMIT, CannedRepliesLimitError, createCannedReply, listCannedReplies, type CannedReplyRow } from "@/lib/stores/ig-canned-replies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const criarSchema = z.object({ titulo: z.string().trim().min(1).max(40), texto: z.string().trim().min(1).max(1000) });

const paraResposta = (r: CannedReplyRow) => ({ id: r.id, titulo: r.title, texto: r.text });

// GET /api/ig/canned-replies — as respostas prontas da loja (abrem com `/` no campo de resposta).
export async function GET(req: Request) {
  try {
    const ctx = await requireConversas(req);
    return Response.json({ respostas: (await listCannedReplies(ctx.tenantId)).map(paraResposta) });
  } catch (e) {
    return responderErroConversa(e);
  }
}

// POST /api/ig/canned-replies — { titulo ≤ 40, texto ≤ 1000 }. Só dono ou admin; o teto de 50 é do banco.
export async function POST(req: Request) {
  try {
    const ctx = await requireConversas(req, { admin: true });
    const corpo = criarSchema.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return corpoInvalido();
    try {
      const criada = await createCannedReply(ctx.tenantId, { title: corpo.data.titulo, text: corpo.data.texto });
      return Response.json({ resposta: paraResposta(criada) }, { status: 201 });
    } catch (e) {
      if (e instanceof CannedRepliesLimitError) return Response.json({ error: `Você já tem ${CANNED_REPLIES_LIMIT} respostas prontas. Apague uma para criar outra.`, code: "limite" }, { status: 409 });
      throw e;
    }
  } catch (e) {
    return responderErroConversa(e);
  }
}
