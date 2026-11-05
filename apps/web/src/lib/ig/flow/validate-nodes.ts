import { normalizeForMatch } from "@/lib/ig/match-keyword";
import { alternativesOf } from "./choices";
import { TAG_RE, isValidFieldKey } from "./names";
import { MAX_CHOICE_LENGTH, MAX_CHOICES, type ConditionNode, type MessageNode, type TagNode } from "./types";
import type { IssueCode } from "./validate";

export type AddIssue = (code: IssueCode, nodeId: string | null, text: string) => void;

/** Um valor de "Se… campo" compara o texto inteiro da ficha, que pode ser resposta livre (até 200). */
const MAX_VALUE_LENGTH = 200;

/** Regras comuns de uma lista de escolhas/valores: vazia, longa, repetida, demais. `alternativas` = vírgula separa. */
function listaProblemas(lista: readonly string[], max: number, alternativas: boolean): string | null {
  if (lista.length > MAX_CHOICES) return `No máximo ${MAX_CHOICES} escolhas.`;
  const inteiros = new Set<string>();
  const alts = new Set<string>();
  for (const item of lista) {
    const normal = normalizeForMatch(item);
    if (!normal || (alternativas && alternativesOf(item).length === 0)) return "Tem escolha vazia.";
    if ([...item].length > max) return `Cada escolha vai até ${max} caracteres.`;
    if (inteiros.has(normal)) return `“${item}” aparece mais de uma vez.`;
    inteiros.add(normal);
    if (alternativas) {
      for (const alt of alternativesOf(item)) {
        const n = normalizeForMatch(alt);
        if (alts.has(n)) return `“${alt}” aparece em mais de uma escolha.`;
        alts.add(n);
      }
    }
  }
  return null;
}

export function validateChoices(node: MessageNode, add: AddIssue): void {
  const choices = node.choices ?? [];
  if (choices.length > 0) {
    const problema = listaProblemas(choices, MAX_CHOICE_LENGTH, true);
    if (problema) add("escolhas_invalidas", node.id, problema);
    if (node.button !== null) add("escolhas_invalidas", node.id, "Pergunta com escolhas não tem botão: a escolha já é o toque. Tire o botão.");
    if (!node.wait) add("botao_sem_espera", node.id, "As escolhas só funcionam num direct que espera a resposta.");
  }
  if (node.saveTo != null && !isValidFieldKey(node.saveTo)) {
    add("campo_invalido", node.id, "O campo da ficha usa letras minúsculas, números e _, começando por letra.");
  }
}

export function validateTag(node: TagNode, add: AddIssue): void {
  if (node.add.length === 0 && node.remove.length === 0) add("etiqueta_invalida", node.id, "Escolha uma etiqueta para pôr ou tirar.");
  for (const tag of [...node.add, ...node.remove]) {
    if (!TAG_RE.test(tag)) add("etiqueta_invalida", node.id, `“${tag}” não é uma etiqueta válida: minúsculas, números e hífen, até 40.`);
  }
}

export function validateCondition(node: ConditionNode, add: AddIssue): void {
  if (node.check === "field") {
    if (!node.field) add("condicao_incompleta", node.id, "Escolha o campo da ficha que o Se… confere.");
    else if (!isValidFieldKey(node.field)) add("campo_invalido", node.id, "O campo da ficha usa letras minúsculas, números e _, começando por letra.");
    const values = node.values ?? [];
    if (values.length === 0) add("condicao_incompleta", node.id, "Escolha pelo menos um valor para conferir.");
    else {
      const problema = listaProblemas(values, MAX_VALUE_LENGTH, false);
      if (problema) add("escolhas_invalidas", node.id, problema);
    }
  }
  if (node.check === "tag") {
    if (!node.tag) add("condicao_incompleta", node.id, "Escolha a etiqueta que o Se… confere.");
    else if (!TAG_RE.test(node.tag)) add("etiqueta_invalida", node.id, `“${node.tag}” não é uma etiqueta válida.`);
  }
}
