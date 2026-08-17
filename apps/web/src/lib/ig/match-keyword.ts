/**
 * Casamento de palavra-chave do IG Connect.
 *
 * É o coração da feature e o lugar onde um bug custa caro nas duas direções:
 * um falso negativo é um cliente que pediu o link e não recebeu; um falso
 * positivo é uma DM para quem não pediu nada — que é justamente o que a Meta
 * pune. Por isso este módulo é PURO (sem I/O, sem banco, sem rede) e coberto
 * por teste, e não lógica solta dentro do handler do webhook.
 *
 * Contrato: recebe o texto do comentário/DM e as palavras configuradas pelo
 * lojista; devolve a palavra ORIGINAL que casou, ou `null`.
 */

/** Letra ou dígito em qualquer alfabeto — a definição de "dentro de uma palavra". */
const WORDISH = /[\p{L}\p{N}]/u;

/** Metacaracteres de RegExp. Palavra-chave vem do painel: é input do usuário. */
const REGEXP_META = /[.*+?^${}()|[\]\\]/g;

/**
 * Deixa dois textos comparáveis: sem acento, minúsculo, espaço colapsado.
 *
 * Sem acento nas DUAS pontas de propósito — o lojista configura "PREÇO" e o
 * cliente escreve "preco" (ou o contrário), e nenhum dos dois deveria perder a
 * venda por causa de uma cedilha.
 */
export function normalizeForMatch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Devolve a palavra-chave que casou, ou `null`.
 *
 * Quando mais de uma casa, ganha a MAIS ESPECÍFICA (a mais longa depois de
 * normalizada). Isso torna o resultado independente da ordem em que o lojista
 * digitou os chips: o mesmo comentário casa sempre igual, o que importa porque
 * o `trigger_id` vai no log de atendimento e no funil.
 */
export function matchKeyword(text: string, keywords: readonly string[]): string | null {
  const haystack = normalizeForMatch(text);
  if (!haystack) return null;

  let best: string | null = null;
  let bestLength = 0;

  for (const keyword of keywords) {
    const needle = normalizeForMatch(keyword);

    // Chip vazio ou só espaço NUNCA casa. Sem esta linha, um chip em branco
    // adicionado por acidente no painel casaria com qualquer texto e todo
    // comentário do post viraria DM.
    if (!needle) continue;

    // Já temos algo mais específico: nem testa.
    if (needle.length <= bestLength) continue;
    if (!containsWholeWord(haystack, needle)) continue;

    best = keyword;
    bestLength = needle.length;
  }

  return best;
}

/**
 * `needle` aparece em `haystack` como palavra inteira?
 *
 * Não usa `\b` porque `\b` é definido sobre `[A-Za-z0-9_]` e trataria letra
 * acentuada como fronteira. Usa lookaround sobre letra-ou-dígito Unicode.
 *
 * As fronteiras são condicionais: se a própria palavra-chave começa (ou termina)
 * com algo que não é letra nem dígito — um emoji, por exemplo — exigir que o
 * vizinho não seja letra seria absurdo, e "🔥" nunca casaria em "quero 🔥".
 */
function containsWholeWord(haystack: string, needle: string): boolean {
  const startsInsideWord = WORDISH.test(needle.slice(0, 1));
  const endsInsideWord = WORDISH.test(needle.slice(-1));

  const before = startsInsideWord ? "(?<![\\p{L}\\p{N}])" : "";
  const after = endsInsideWord ? "(?![\\p{L}\\p{N}])" : "";

  const pattern = `${before}${needle.replace(REGEXP_META, "\\$&")}${after}`;
  return new RegExp(pattern, "u").test(haystack);
}
