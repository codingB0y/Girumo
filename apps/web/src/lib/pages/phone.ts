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

/**
 * Dígitos sem os zeros da frente e sem o 55 do país (só quando sobram 12+:
 * com 11, o 55 é o DDD de Santa Maria/RS).
 */
function numeroNacional(raw: string | null | undefined): string {
  const digitos = String(raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digitos.length >= 12 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
}

/**
 * Chave de telefone da atribuição (spec 2026-10-10-funil-anuncios §1): DDD +
 * últimos 8 dígitos. Resolve o nono dígito: com e sem ele dão a mesma chave.
 *
 * Espelho EXATO de `public.phone_key` no banco — mudar um sem o outro faz a
 * tela de integração e o relatório da aba Anúncios discordarem.
 */
export function chaveDoTelefone(raw: string | null | undefined): string | null {
  const d = numeroNacional(raw);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : null;
}

/**
 * Telefone de terceiro em lista (spec §7): DDD, o 9 da frente do celular e os
 * 4 últimos — `(62) 9••••-4821`. O número inteiro só aparece em Contatos.
 */
export function telefoneMascarado(raw: string | null | undefined): string {
  const d = numeroNacional(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2] === "9" ? "9" : "•"}••••-${d.slice(-4)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ••••-${d.slice(-4)}`;
  return "•••";
}
