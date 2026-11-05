import { matchKeyword, normalizeForMatch } from "@/lib/ig/match-keyword";
import { MAX_CHOICES } from "./types";

/** "Sim, quero" → ["Sim", "quero"]: o botão mostra o texto inteiro, a pessoa pode digitar qualquer parte. */
export function alternativesOf(choice: string): string[] {
  return choice.split(",").map((a) => a.trim()).filter(Boolean);
}

/**
 * A escolha que o texto digitado escolheu: `matchKeyword` sobre as alternativas de TODAS as escolhas
 * (a mais longa ganha) e o índice da dona da vencedora. `null` = nenhuma casou.
 */
export function matchChoice(texto: string, choices: readonly string[]): number | null {
  const dono = new Map<string, number>();
  choices.forEach((choice, i) => {
    for (const alt of alternativesOf(choice)) if (!dono.has(alt)) dono.set(alt, i);
  });
  const vencedora = matchKeyword(texto, [...dono.keys()]);
  return vencedora === null ? null : (dono.get(vencedora) ?? null);
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
