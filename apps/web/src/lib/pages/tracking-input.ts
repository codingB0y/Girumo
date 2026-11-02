import { GA4_ID_MSG, PIXEL_ID_MSG, ga4TagId, metaPixelId } from "@/lib/tracking-ids";

export type LpTrackingPatch = { meta_pixel_id?: string | null; ga4_id?: string | null };

export type LpTrackingParse =
  | { ok: true; patch: LpTrackingPatch }
  | { ok: false; details: string[] };

const FIELDS = [
  { key: "meta_pixel_id", normalize: metaPixelId, msg: PIXEL_ID_MSG },
  { key: "ga4_id", normalize: ga4TagId, msg: GA4_ID_MSG },
] as const;

/**
 * Ids de rastreio do corpo de POST/PATCH /api/pages. Campo ausente fica fora do
 * patch; vazio ou null apaga; preenchido tem de casar o formato, senão 400 — antes
 * o id errado era gravado e o rastreio sumia em silêncio na página pública.
 *
 * Cada detalhe começa pelo nome do campo: é por ele que os editores
 * (`errorField`, `fieldErrorsV3`) põem a mensagem embaixo do input certo.
 */
export function parseLpTrackingIds(body: Record<string, unknown>): LpTrackingParse {
  const patch: LpTrackingPatch = {};
  const details: string[] = [];
  for (const { key, normalize, msg } of FIELDS) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (raw === null || (typeof raw === "string" && !raw.trim())) {
      patch[key] = null;
      continue;
    }
    const id = typeof raw === "string" ? normalize(raw) : null;
    if (id) patch[key] = id;
    else details.push(`${key} inválido: ${msg}.`);
  }
  return details.length ? { ok: false, details } : { ok: true, patch };
}
