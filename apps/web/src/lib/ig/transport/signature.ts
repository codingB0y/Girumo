import { createHmac, timingSafeEqual } from "node:crypto";

const HEX_64 = /^[0-9a-f]{64}$/;

/** `X-Zernio-Signature` = HMAC-SHA256 do corpo cru em hex. Comparação em tempo constante. */
export function assinaturaConfere(corpoCru: string, recebida: string | null, segredo: string): boolean {
  if (!recebida || !segredo) return false;
  const hex = recebida.trim().toLowerCase();
  if (!HEX_64.test(hex)) return false;
  const esperada = createHmac("sha256", segredo).update(corpoCru).digest();
  const dada = Buffer.from(hex, "hex");
  return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}
