/**
 * Normaliza para comparação: minúscula, sem acento, e tudo que não é letra ou
 * dígito vira espaço.
 *
 * Pontuação e emoji viram SEPARADOR em vez de sumir. Se fossem removidos,
 * "eu,quero" viraria "euquero" e deixaria de casar — e é escrita comum no
 * grupo. Como separador, casa.
 */
export function normalizeKeyword(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * O comentário casa a palavra-chave?
 *
 * Substring COM fronteira de palavra, não igualdade: "eu quero esse!!!" conta,
 * "euquero" não. Igualdade exata deixaria de fora quase todo mundo, que escreve
 * a palavra no meio de uma frase; substring solta casaria "quero" dentro de
 * "requerido".
 */
export function matchesKeyword(text: string | null | undefined, keyword: string): boolean {
  if (!text) return false;

  const alvo = normalizeKeyword(keyword);
  if (!alvo) return false;

  return ` ${normalizeKeyword(text)} `.includes(` ${alvo} `);
}
