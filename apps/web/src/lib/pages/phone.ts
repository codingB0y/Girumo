/**
 * WhatsApp BR — normalização para E.164 (+55DDDNÚMERO).
 * Extraído de schema.ts para isolar a regra e testá-la sozinha (Girumo LP v2).
 */

/**
 * Normaliza WhatsApp BR pra E.164 (+55DDDNÚMERO).
 * Aceita: (62) 99819-1314 · 62998191314 · 5562998191314 · +55 62 ...
 * Retorna null se não parecer um celular/fixo BR válido (DDD 11-99 + 8-9 dígitos).
 */
export function normalizeWhatsappBR(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return null;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  return `+55${digits}`;
}
