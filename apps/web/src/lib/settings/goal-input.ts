/**
 * Metas do mês (contatos e receita) vindas do `PATCH /api/settings`.
 *
 * A rota fazia `Number(v)` cru, então `"abc"` virava `NaN`, `""` virava `0` e
 * `-50` passava inteiro. Os três chegavam no banco: a barra de progresso do
 * painel divide pela meta, e uma meta `NaN` ou negativa quebra o cálculo em vez
 * de ser recusada na fronteira.
 */

/** Entrada inválida — a rota responde 400 em vez de gravar. */
export const INVALID_GOAL = Symbol("meta inválida");

export function parseGoalInput(value: unknown): number | null | typeof INVALID_GOAL {
  // Apagar a meta é legítimo e é diferente de mandar lixo.
  if (value === null) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : INVALID_GOAL;
  }

  if (typeof value === "string") {
    const texto = value.trim();
    // Campo esvaziado no formulário: limpa a meta. `Number("")` daria 0.
    if (!texto) return null;
    const n = Number(texto);
    return Number.isFinite(n) && n >= 0 ? n : INVALID_GOAL;
  }

  return INVALID_GOAL;
}
