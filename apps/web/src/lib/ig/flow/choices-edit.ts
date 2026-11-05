import { choiceIndex, choiceOut, type FlowDef, type FlowEdge, type FlowNode } from "./types";

/**
 * Remover ou reordenar escolhas (de uma Pergunta) ou valores (de um "Se… campo") renumera as
 * ligações `v*` do bloco junto: apagar a escolha apaga a ligação dela. A saída `other` não muda,
 * exceto quando a lista esvazia (aí `other` deixa de existir no bloco e a ligação dela cai).
 */
type Mapa = (i: number) => number | null;

const lista = (n: FlowNode): string[] | undefined => (n.type === "message" ? n.choices : n.type === "condition" ? n.values : undefined);

function comLista(n: FlowNode, novas: string[]): FlowNode {
  if (n.type === "message") return { ...n, choices: novas };
  if (n.type === "condition") return { ...n, values: novas };
  return n;
}

function aplicar(def: FlowDef, nodeId: string, novas: (atual: string[]) => string[], mapa: Mapa): FlowDef {
  const alvo = def.nodes.find((n) => n.id === nodeId);
  const atual = alvo ? lista(alvo) : undefined;
  if (!alvo || !atual) return def;
  const proxima = novas(atual);
  const nodes = def.nodes.map((n) => (n.id === nodeId ? comLista(n, proxima) : n));
  const edges = def.edges.flatMap<FlowEdge>((e) => {
    if (e.from !== nodeId) return [e];
    if (e.out === "other") return proxima.length === 0 ? [] : [e];
    const i = choiceIndex(e.out);
    if (i === null) return [e];
    const j = mapa(i);
    return j === null ? [] : [{ ...e, out: choiceOut(j) }];
  });
  return { ...def, nodes, edges };
}

export function removeChoice(def: FlowDef, nodeId: string, index: number): FlowDef {
  return aplicar(def, nodeId, (l) => l.filter((_, i) => i !== index), (i) => (i === index ? null : i > index ? i - 1 : i));
}

export function moveChoice(def: FlowDef, nodeId: string, from: number, to: number): FlowDef {
  const atual = def.nodes.find((n) => n.id === nodeId);
  const l = atual ? lista(atual) : undefined;
  if (!l || from === to || from < 0 || to < 0 || from >= l.length || to >= l.length) return def;
  return aplicar(
    def,
    nodeId,
    (itens) => {
      const copia = [...itens];
      const [item] = copia.splice(from, 1);
      copia.splice(to, 0, item);
      return copia;
    },
    (i) => {
      if (i === from) return to;
      if (from < to) return i > from && i <= to ? i - 1 : i;
      return i >= to && i < from ? i + 1 : i;
    },
  );
}
