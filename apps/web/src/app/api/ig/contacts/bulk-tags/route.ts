import { z } from "zod";
import { requirePessoas } from "@/lib/ig/access";
import { isUuid } from "@/lib/ig/flow/body";
import { filtrosSchema, invalido, normalizarEtiquetas, paraFiltros, responderErro } from "@/lib/ig/pessoas-http";
import { bulkTags } from "@/lib/stores/ig-contacts-lista";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Varre até 20 mil fichas em lotes de 10: sobra folga para o teto da função.
export const maxDuration = 60;

const MAX_IDS = 500;
const corpoSchema = z
  .object({
    ids: z.array(z.string().refine(isUuid)).min(1).max(MAX_IDS).optional(),
    filtros: filtrosSchema.optional(),
    add: z.array(z.string().max(80)).max(20).optional(),
    remove: z.array(z.string().max(80)).max(20).optional(),
  })
  // Ou os selecionados, ou todos os filtrados: nunca os dois, nunca nenhum (nenhum seria "a loja inteira" sem querer).
  .refine((b) => (b.ids === undefined) !== (b.filtros === undefined))
  .refine((b) => (b.add?.length ?? 0) + (b.remove?.length ?? 0) > 0);

// POST /api/ig/contacts/bulk-tags — { ids | filtros, add?, remove? } → { atualizadas }.
export async function POST(req: Request) {
  try {
    const { ctx } = await requirePessoas(req, "escrever");
    const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalido();
    const add = normalizarEtiquetas(parsed.data.add ?? []);
    const remove = normalizarEtiquetas(parsed.data.remove ?? []);
    if (!add || !remove) return Response.json({ error: "Etiqueta inválida: use letras, números e hífen." }, { status: 400 });
    const alvo = parsed.data.ids ? { ids: parsed.data.ids } : { filtros: paraFiltros(parsed.data.filtros ?? {}) };
    return Response.json({ atualizadas: await bulkTags(ctx.tenantId, alvo, add, remove) });
  } catch (e) {
    return responderErro(e);
  }
}
