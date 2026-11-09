import { createHmac, timingSafeEqual } from "node:crypto";

/** base64 padrão de 32 bytes: 43 caracteres e um "=" (Fase 0, S2). */
const BASE64_32 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * `X-Yampi-Hmac-SHA256` = base64 do HMAC-SHA256 do corpo CRU com o `secret_key` do aviso (Fase 0, Y9).
 * Bytes crus como chegaram: decodificar antes tira o BOM e troca byte inválido, e o HMAC deixa de bater.
 * Comparação em tempo constante; cabeçalho fora do formato nunca lança.
 */
export function assinaturaYampiConfere(corpo: Uint8Array | string, cabecalho: string | null, segredo: string): boolean {
  if (!segredo || !cabecalho) return false;
  const recebida = cabecalho.trim();
  if (!BASE64_32.test(recebida)) return false;
  const esperada = createHmac("sha256", segredo).update(corpo).digest();
  const lida = Buffer.from(recebida, "base64");
  return lida.length === esperada.length && timingSafeEqual(lida, esperada);
}
