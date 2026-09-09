/**
 * Segmentos de negócio (ramo) do tenant — decisão de 30/08/2026: produto
 * horizontal, marketing vertical. O esqueleto do painel é neutro e o CONTEÚDO
 * (biblioteca de copies, sugestões) troca de pack pelo segmento — a mesma tese
 * do posicionamento ("fala a língua do lojista") aplicada a cada nicho.
 *
 * Fonte única: signup, Configurações e a validação da API leem daqui. O `id`
 * vai pro banco (`tenant_settings.segment`) como texto SEM CHECK de propósito —
 * nicho novo entra adicionando uma linha aqui, sem migração.
 */

export const SEGMENTS = [
  { id: "moda_atacado", label: "Moda / atacado de roupa" },
  { id: "calcados", label: "Calçados" },
  { id: "beleza", label: "Beleza e cosméticos" },
  { id: "mercado", label: "Mercado e alimentos" },
  { id: "moveis", label: "Móveis e casa" },
  { id: "outro", label: "Outro ramo" },
] as const;

export type SegmentId = (typeof SEGMENTS)[number]["id"];

export function isSegmentId(value: unknown): value is SegmentId {
  return typeof value === "string" && SEGMENTS.some((s) => s.id === value);
}
