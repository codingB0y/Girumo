import { freshId } from "./edit";
import { nodeById, reachableIds, targetOf } from "./graph";
import { MAIN_OUTS, MAX_WAIT_MINUTES, outsOf, type FlowDef, type FlowEdge, type FlowNode, type FlowOut } from "./types";

/**
 * Operações de edição dos blocos novos (Pergunta, Etiqueta, Se…): inserir depois de um passo,
 * apagar religando, ligar cada saída a um bloco. Puras, como o resto desta pasta.
 */
export type NovoBloco = "pergunta" | "etiqueta" | "se";

const mainOut = (node: FlowNode): FlowOut | null => {
  const outs = outsOf(node);
  return MAIN_OUTS.find((o) => outs.includes(o)) ?? null;
};

function novoNo(kind: NovoBloco, id: string): FlowNode {
  if (kind === "etiqueta") return { id, type: "tag", add: [], remove: [] };
  if (kind === "se") return { id, type: "condition", check: "field", field: "", values: [""] };
  return { id, type: "message", text: "", button: null, wait: { minutes: MAX_WAIT_MINUTES }, choices: ["Sim", "Não"], saveTo: null };
}

/** Põe um bloco novo na saída principal de `afterId`; o que vinha depois passa a vir depois dele. */
export function insertAfter(def: FlowDef, afterId: string, kind: NovoBloco): FlowDef {
  const alvo = nodeById(def, afterId);
  const saida = alvo ? mainOut(alvo) : null;
  if (!alvo || !saida) return def;
  const seguinte = targetOf(def, afterId, saida);
  const novo = novoNo(kind, freshId(def, kind === "se" ? "se" : kind));
  const saidaNova = mainOut(novo) as FlowOut;
  const nodes = [...def.nodes];
  nodes.splice(nodes.findIndex((n) => n.id === afterId) + 1, 0, novo);
  const edges: FlowEdge[] = [
    ...def.edges.filter((e) => !(e.from === afterId && e.out === saida)),
    { from: afterId, out: saida, to: novo.id },
    ...(seguinte ? [{ from: novo.id, out: saidaNova, to: seguinte }] : []),
  ];
  return { ...def, nodes, edges };
}

/**
 * Apaga o bloco; quem chegava nele passa a chegar no que vinha depois da saída principal. O gatilho fica.
 * `loose`: os blocos que deixam de ter caminho até eles (vão para "Blocos soltos"); a tela confirma antes.
 */
export function planRemoveBlock(def: FlowDef, id: string): { def: FlowDef; loose: string[] } {
  const alvo = nodeById(def, id);
  if (!alvo || alvo.type === "trigger") return { def, loose: [] };
  const saida = mainOut(alvo);
  const seguinte = saida ? targetOf(def, id, saida) : null;
  const edges = def.edges.flatMap<FlowEdge>((e) => {
    if (e.from === id) return [];
    if (e.to !== id) return [e];
    return seguinte && seguinte !== id && seguinte !== e.from ? [{ ...e, to: seguinte }] : [];
  });
  const depois: FlowDef = { ...def, nodes: def.nodes.filter((n) => n.id !== id), edges };
  const antes = reachableIds(def);
  const ficam = reachableIds(depois);
  return { def: depois, loose: [...antes].filter((x) => x !== id && !ficam.has(x)) };
}

export const removeBlock = (def: FlowDef, id: string): FlowDef => planRemoveBlock(def, id).def;

/** Liga a saída `out` de `from` ao bloco `to`; `null` desliga (o fluxo para ali). */
export function linkOut(def: FlowDef, from: string, out: FlowOut, to: string | null): FlowDef {
  const origem = nodeById(def, from);
  if (!origem || !outsOf(origem).includes(out)) return def;
  if (to !== null && (to === from || !nodeById(def, to))) return def;
  const edges = def.edges.filter((e) => !(e.from === from && e.out === out));
  return { ...def, edges: to ? [...edges, { from, out, to }] : edges };
}

const CAMPO_PARA_ETIQUETA: Partial<Record<FlowOut, FlowOut>> = { v0: "yes", other: "no" };
const ETIQUETA_PARA_CAMPO: Partial<Record<FlowOut, FlowOut>> = { yes: "v0", no: "other" };

/**
 * Troca o que o Se… confere. Campo → etiqueta: `v0` vira `yes` e `other` vira `no`; etiqueta → campo, o inverso.
 * `lost`: as saídas ligadas que não têm par (`v1`…) e por isso perdem a ligação; a tela confirma antes.
 */
export function planConditionCheck(def: FlowDef, id: string, check: "field" | "tag"): { def: FlowDef; lost: FlowOut[] } {
  const alvo = nodeById(def, id);
  if (!alvo || alvo.type !== "condition" || alvo.check === check) return { def, lost: [] };
  const mapa = check === "tag" ? CAMPO_PARA_ETIQUETA : ETIQUETA_PARA_CAMPO;
  const nodes = def.nodes.map<FlowNode>((n) => {
    if (n.id !== id) return n;
    return check === "tag" ? { id, type: "condition", check, tag: "" } : { id, type: "condition", check, field: "", values: [""] };
  });
  const lost: FlowOut[] = [];
  const edges = def.edges.flatMap<FlowEdge>((e) => {
    if (e.from !== id) return [e];
    const nova = mapa[e.out];
    if (nova) return [{ ...e, out: nova }];
    lost.push(e.out);
    return [];
  });
  return { def: { ...def, nodes, edges }, lost };
}

export const setConditionCheck = (def: FlowDef, id: string, check: "field" | "tag"): FlowDef => planConditionCheck(def, id, check).def;

/** Os campos da ficha que o próprio fluxo já usa (Pergunta guarda, Se… confere): sugestão ao digitar. */
export function fieldKeysIn(def: FlowDef): string[] {
  const chaves = new Set<string>();
  for (const n of def.nodes) {
    if (n.type === "message" && n.saveTo) chaves.add(n.saveTo);
    if (n.type === "condition" && n.check === "field" && n.field) chaves.add(n.field);
  }
  return [...chaves].sort();
}
