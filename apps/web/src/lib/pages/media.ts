/**
 * Resolução de mídia da LP v2 (Girumo). Centraliza como um `LpMediaRef` vira o
 * `src` da imagem e o `object-position` a partir do ponto focal.
 *
 * Regra: `media_id` é o caminho preferido — aponta para `/api/p/media/:id`, a rota
 * PÚBLICA de mídia de LP. Ela é same-origin, então o next/image otimiza a partir
 * dela (webp/avif + srcset) e o visitante nunca recebe o arquivo bruto. A rota
 * privada `/api/media/:id` (editor/engine) não é usada no render público.
 * `url` é o fallback de conteúdo legado/externo (o adaptador do v1 gera `hero.url`
 * a partir da antiga `photo_url`). Nunca embutimos o arquivo-fonte.
 */

import type { LpMediaRef } from "./content";

/** `src` da imagem a partir da referência de mídia (público por id > url legada). */
export function mediaSrc(ref: LpMediaRef): string {
  if (ref.media_id) return `/api/p/media/${encodeURIComponent(ref.media_id)}`;
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
