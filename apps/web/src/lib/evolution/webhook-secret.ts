import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comparação do secret do webhook em tempo constante.
 *
 * Módulo próprio, sem `server-only`, para ser testável: o receiver importa
 * stores que dependem de módulos virtuais do Next e não carregam sob o test
 * runner. É o mesmo motivo pelo qual `request-access-policy` vive separado do
 * middleware.
 *
 * Compara digests SHA-256 em vez das strings: `timingSafeEqual` lança quando os
 * buffers têm tamanhos diferentes, e esse throw viraria um 500 que denuncia o
 * tamanho do secret esperado. Digest deixa os dois lados com 32 bytes fixos.
 */
export function secretMatches(provided: string | null, expected: string): boolean {
  // Fail-closed: env ausente não pode virar "qualquer header serve".
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
