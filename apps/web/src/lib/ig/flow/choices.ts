import { matchKeyword, normalizeForMatch } from "@/lib/ig/match-keyword";
import { MAX_CHOICES } from "./types";

/** "Sim, quero" → ["Sim", "quero"]: o botão mostra o texto inteiro, a pessoa pode digitar qualquer parte. */
export function alternativesOf(choice: string): string[] {
  return choice.split(",").map((a) => a.trim()).filter(Boolean);
}

/**
 * A escolha que o texto digitado escolheu: as alternativas de TODAS as escolhas que casam com o texto
 * (`matchKeyword`, uma a uma) e a dona delas. Alternativa que está dentro de outra que também casou
 * ("5" dentro de "5 a 8") perde para a mais específica. Sobrando alternativas de escolhas DIFERENTES
 * ("não quero" casa "não" e "quero"), é ambíguo: `null`, como texto que não casa nada.
 */
export function matchChoice(texto: string, choices: readonly string[]): number | null {
  const casadas: Array<{ dona: number; alt: string }> = [];
  choices.forEach((choice, i) => {
    for (const alt of alternativesOf(choice)) if (matchKeyword(texto, [alt]) !== null) casadas.push({ dona: i, alt: normalizeForMatch(alt) });
  });
  const dentro = (menor: string, maior: string) => maior.length > menor.length && ` ${maior} `.includes(` ${menor} `);
  const donas = new Set(casadas.filter((c) => !casadas.some((o) => dentro(c.alt, o.alt))).map((c) => c.dona));
  return donas.size === 1 ? [...donas][0] : null;
}

/** Lê o payload `<run>:<bloco>:<i>` de uma resposta rápida; `null` se for de outro run/bloco ou malformado. */
export function choiceFromPayload(payload: string, runId: string, nodeId: string): number | null {
  const prefixo = `${runId}:${nodeId}:`;
  if (!payload.startsWith(prefixo)) return null;
  const resto = payload.slice(prefixo.length);
  return /^\d{1,2}$/.test(resto) && Number(resto) < MAX_CHOICES ? Number(resto) : null;
}

/** "Se…" campo: o valor INTEIRO da ficha contra cada valor (`goiania` = `Goiânia`). */
export function matchFieldValue(valor: string, values: readonly string[]): number | null {
  const alvo = normalizeForMatch(valor);
  if (!alvo) return null;
  const i = values.findIndex((v) => normalizeForMatch(v) === alvo);
  return i === -1 ? null : i;
}
