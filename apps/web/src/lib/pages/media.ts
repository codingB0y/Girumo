/**
 * Resolução de mídia da LP v2 (Girumo). Centraliza como um `LpMediaRef` vira o
 * `src` da imagem e o `object-position` a partir do ponto focal.
 *
 * Regra: `media_id` é o caminho preferido — aponta para `/api/media/:id`, que a
 * Fase 3 torna público e passa a servir um DERIVADO otimizado (nunca o arquivo
 * bruto). `url` é o fallback de conteúdo legado/externo (o adaptador do v1 gera
 * `hero.url` a partir da antiga `photo_url`). Nunca embutimos o arquivo-fonte.
 */

import type { LpMediaRef } from "./content";

/** `src` da imagem a partir da referência de mídia (derivado por id > url legada). */
export function mediaSrc(ref: LpMediaRef): string {
  if (ref.media_id) return `/api/media/${encodeURIComponent(ref.media_id)}`;
  if (ref.url) return ref.url;
  return "";
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * `object-position` a partir do ponto focal normalizado (0..1 em cada eixo).
 * Sem foco definido cai no centro (50% 50%); valores fora do intervalo são clampados.
 */
export function mediaPosition(ref: LpMediaRef): string {
  if (typeof ref.focal_x !== "number" || typeof ref.focal_y !== "number") {
    return "50% 50%";
  }
  return `${clamp01(ref.focal_x) * 100}% ${clamp01(ref.focal_y) * 100}%`;
}
