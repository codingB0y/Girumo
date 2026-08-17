/**
 * Motivo de cancelamento informado pelo lojista.
 *
 * O texto vem de um textarea e chega por JSON de cliente, então nada aqui pode
 * confiar no tipo. A política é guardar o máximo possível do que a pessoa
 * escreveu — truncar em vez de rejeitar — porque um motivo pela metade ainda
 * informa a decisão de produto, e um 400 devolvido no meio do cancelamento só
 * transforma churn em churn irritado.
 */

/** Teto do que persistimos. Acima disso o texto é cortado, nunca recusado. */
export const CHURN_REASON_MAX = 2000;

/**
 * Controles ASCII e DEL, menos `\n` (U+000A): parágrafo é conteúdo legítimo.
 * Montada a partir de string para não deixar caractere de controle literal no
 * arquivo — literal invisível é frágil a copiar, revisar e editar.
 */
const CARACTERE_DE_CONTROLE = new RegExp("[\\u0000-\\u0009\\u000B-\\u001F\\u007F]", "g");

/** Metade de um par surrogate que sobrou sozinha depois do corte. */
const SURROGATE_ORFAO = new RegExp("[\\uD800-\\uDBFF]$");

export function normalizeChurnReason(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const limpo = input.replace(CARACTERE_DE_CONTROLE, "").trim();
  if (!limpo) return null;

  if (limpo.length <= CHURN_REASON_MAX) return limpo;

  // Cortar no meio de um par surrogate deixaria um caractere inválido no fim —
  // o emoji que o lojista usou viraria lixo no relatório.
  return limpo.slice(0, CHURN_REASON_MAX).replace(SURROGATE_ORFAO, "");
}
