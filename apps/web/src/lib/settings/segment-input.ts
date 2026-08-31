import { isSegmentId, type SegmentId } from "@/lib/segments";

/**
 * Segmento (ramo) vindo do `PATCH /api/settings` e do signup.
 *
 * Mesmo contrato do `goal-input`: a fronteira recusa lixo em vez de gravar.
 * `null` — ou a string vazia de um `<select>` limpo — apaga a escolha, o que é
 * legítimo e diferente de mandar um id que não existe no catálogo.
 */

/** Entrada inválida — a rota responde 400 em vez de gravar. */
export const INVALID_SEGMENT = Symbol("segmento inválido");

export function parseSegmentInput(value: unknown): SegmentId | null | typeof INVALID_SEGMENT {
  if (value === null) return null;

  if (typeof value === "string") {
    const texto = value.trim();
    if (!texto) return null;
    return isSegmentId(texto) ? texto : INVALID_SEGMENT;
  }

  return INVALID_SEGMENT;
}
