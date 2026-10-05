import { nodeById, targetOf, triggerOf } from "./graph";
import { MAIN_OUTS, outsOf, type FlowDef, type FlowNode, type FlowOut } from "./types";

export type Ramo = {
  out: FlowOut;
  /** O bloco em que o desvio chega, com os próprios desvios; `null` = "Parou aqui" ou volta. */
  alvo: Passo | null;
  /** Id de um bloco da trilha para onde o desvio volta (ciclo). */
  volta: string | null;
};

export type Passo = {
  node: FlowNode;
  ramos: Ramo[];
  /** A saída principal e para onde ela vai; `to: null` = fim do fluxo. */
  proximo: { out: FlowOut; to: string | null } | null;
};

function saidaPrincipal(node: FlowNode): FlowOut | null {
  const outs = outsOf(node);
  return MAIN_OUTS.find((out) => outs.includes(out)) ?? null;
}

/**
 * A visão "Passo a passo": a trilha principal segue `next`, `replied`, `yes`,
 * `clicked` (nessa preferência); as outras saídas viram desvios pendurados no
 * passo. O mesmo grafo alimenta o mapa (`layout.ts`).
 */
export function linearize(def: FlowDef): Passo[] {
  const start = triggerOf(def);
  if (!start) return [];
  const principais: FlowNode[] = [];
  const naTrilha = new Set<string>();
  for (let atual: FlowNode | undefined = start; atual && !naTrilha.has(atual.id); ) {
    naTrilha.add(atual.id);
    principais.push(atual);
    const principal = saidaPrincipal(atual);
    const proximoId: string | null = principal ? targetOf(def, atual.id, principal) : null;
    atual = proximoId ? nodeById(def, proximoId) : undefined;
  }
  return principais.map((node) => {
    const principal = saidaPrincipal(node);
    return {
      node,
      proximo: principal ? { out: principal, to: targetOf(def, node.id, principal) } : null,
      ramos: outsOf(node)
        .filter((out) => out !== principal)
        .map((out) => ramo(def, node.id, out, naTrilha, new Set())),
    };
  });
}

function ramo(def: FlowDef, from: string, out: FlowOut, naTrilha: Set<string>, visitados: Set<string>): Ramo {
  const alvoId = targetOf(def, from, out);
  if (!alvoId) return { out, alvo: null, volta: null };
  if (naTrilha.has(alvoId) || visitados.has(alvoId)) return { out, alvo: null, volta: alvoId };
  const node = nodeById(def, alvoId);
  if (!node) return { out, alvo: null, volta: null };
  const vistos = new Set(visitados).add(alvoId);
  return {
    out,
    volta: null,
    alvo: { node, proximo: null, ramos: outsOf(node).map((o) => ramo(def, node.id, o, naTrilha, vistos)) },
  };
}
