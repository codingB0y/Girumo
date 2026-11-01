/**
 * Formato dos ids de rastreio que o lojista cola (landing page, campanha).
 *
 * O GA4 é o que importa: o id vira `gtag/js?id=<id>` com o nonce da página, e esse
 * endereço serve QUALQUER contêiner do Google, inclusive `GTM-…` (tag Custom HTML =
 * JS do lojista no nosso domínio). Só passa id de GA4 de verdade. Teto de 30
 * caracteres no total, o mesmo da bio (lib/bio/render/script.ts).
 */
export const PIXEL_ID = /^\d{5,20}$/;
export const GA4_ID = /^G-[A-Z0-9]{4,28}$/;

export const PIXEL_ID_MSG = "o ID do Pixel da Meta tem só números (5 a 20 dígitos)";
export const GA4_ID_MSG = 'o ID do GA4 começa com "G-" (ex.: G-XXXXXXXXXX)';

/** Id de GA4 normalizado (trim + maiúsculas), ou null se vazio ou fora do formato. */
export function ga4TagId(raw: string | null | undefined): string | null {
  const id = raw?.trim().toUpperCase() ?? "";
  return GA4_ID.test(id) ? id : null;
}

/** Id do Pixel normalizado (trim), ou null se vazio ou fora do formato. */
export function metaPixelId(raw: string | null | undefined): string | null {
  const id = raw?.trim() ?? "";
  return PIXEL_ID.test(id) ? id : null;
}
