import { z } from "zod";
import { corpoInvalido, paraConversa, requireConversas, responderErroConversa } from "@/lib/ig/conversas/http";
import type { ListaDeConversas } from "@/lib/ig/conversas/tipos";
import { TAG_RE } from "@/lib/ig/flow/names";
import { countConversations, listConversations, listIgUserIdsByTag, type ListFilters } from "@/lib/stores/ig-conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quantas pessoas com a etiqueta entram no filtro `in` (os ids vão na URL do PostgREST). Passou disso, vale as mais recentes. */
const TETO_DA_ETIQUETA = 200;

const consultaSchema = z.object({
  status: z.enum(["open", "waiting", "resolved"]).optional(),
  naoLidas: z.enum(["1", "true"]).optional(),
  busca: z.string().max(60).optional(),
  etiqueta: z.string().regex(TAG_RE).optional(),
  cursor: z.string().regex(/^\d{1,6}$/).optional(),
});

// GET /api/ig/conversations?status=&naoLidas=1&busca=&etiqueta=&cursor= — uma página (50) do índice + o contador de "aguardando você".
export async function GET(req: Request) {
  try {
    const ctx = await requireConversas(req);
    const params = new URL(req.url).searchParams;
    const q = consultaSchema.safeParse(Object.fromEntries([...params].filter(([, v]) => v !== "")));
    if (!q.success) return corpoInvalido();
    const filtros: ListFilters = { status: q.data.status, unread: q.data.naoLidas !== undefined, busca: q.data.busca, cursor: q.data.cursor };
    let etiquetaParcial = false;
    if (q.data.etiqueta) {
      // Pede um a mais que o teto só para saber se cortou.
      const ids = await listIgUserIdsByTag(ctx.tenantId, q.data.etiqueta, TETO_DA_ETIQUETA + 1);
      etiquetaParcial = ids.length > TETO_DA_ETIQUETA;
      filtros.igUserIds = ids.slice(0, TETO_DA_ETIQUETA);
    }
    const [pagina, aguardando] = await Promise.all([listConversations(ctx.tenantId, filtros), countConversations(ctx.tenantId, "waiting")]);
    const agora = new Date();
    const corpo: ListaDeConversas = { conversas: pagina.items.map((c) => paraConversa(c, agora)), proximo: pagina.nextCursor, aguardando, ...(etiquetaParcial ? { etiquetaParcial } : {}) };
    return Response.json(corpo);
  } catch (e) {
    return responderErroConversa(e);
  }
}
