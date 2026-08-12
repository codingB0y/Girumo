import type { LandingPage } from "./schema";

/**
 * Payload de criação de uma cópia de página.
 *
 * O que a cópia leva e o que ela NÃO leva é a decisão inteira desta feature:
 *
 * - **Leva** o conteúdo completo (nome, headline, benefícios, mídia, prova, cor
 *   da marca), o template, o link do grupo e os pixels. É isso que transforma
 *   "criei uma landing" em rotina semanal de promoção.
 * - **Não leva** `campaign_slug`. Duas páginas na mesma campanha somam na mesma
 *   atribuição, e o funil por página — o que o lojista usa pra decidir — vira
 *   ruído. A cópia nasce sem campanha e o editor pede uma nova.
 * - **Não leva** slug (o servidor gera), métricas, capturas nem
 *   `published_version`. E nasce como rascunho: publicar é decisão consciente.
 *
 * `tiktok_pixel_id` fica de fora porque `POST /api/pages` não lê esse campo —
 * mandar aqui seria descartado em silêncio. Se a rota passar a aceitar, incluir.
 */
export type DuplicatePayload = {
  template_id: string;
  content: LandingPage["content"];
  target_group_url: string | null;
  meta_pixel_id: string | null;
  ga4_id: string | null;
};

export function buildDuplicatePayload(page: LandingPage): DuplicatePayload {
  return {
    template_id: page.template_id,
    content: page.content,
    target_group_url: page.target_group_url ?? null,
    meta_pixel_id: page.meta_pixel_id ?? null,
    ga4_id: page.ga4_id ?? null,
  };
}
