import { linearize, type Passo } from "./linearize";
import type { FlowDef, FlowOut } from "./types";

export const NODE_W = 250;
export const NODE_H = 150;
export const COL_PITCH = 281;
export const ROW_PITCH = 230;
export const PAD = 30;

export type NodePos = { id: string; coluna: number; linha: number; x: number; y: number };
export type EdgePos = { from: string; out: FlowOut; to: string; kind: "principal" | "desvio" | "volta" };
export type Layout = { nodes: NodePos[]; edges: EdgePos[]; width: number; height: number };

/**
 * A visão "Mapa", só leitura na fase 1: a trilha na espinha (linha 0), cada
 * desvio na coluna do bloco de origem, uma linha abaixo. Posições calculadas,
 * não guardadas; passam a ser guardadas quando o mapa for editável (fase 5).
 */
export function layout(def: FlowDef): Layout {
  const trilha = linearize(def);
  const nodes: NodePos[] = [];
  const edges: EdgePos[] = [];
  const proximaLinha = new Map<number, number>();

  const colocar = (id: string, coluna: number, linha: number) =>
    nodes.push({ id, coluna, linha, x: PAD + coluna * COL_PITCH, y: PAD + linha * ROW_PITCH });

  const colocarRamos = (passo: Passo, coluna: number) => {
    for (const r of passo.ramos) {
      if (r.volta) {
        edges.push({ from: passo.node.id, out: r.out, to: r.volta, kind: "volta" });
        continue;
      }
      if (!r.alvo) continue;
      const linha = proximaLinha.get(coluna) ?? 1;
      proximaLinha.set(coluna, linha + 1);
      colocar(r.alvo.node.id, coluna, linha);
      edges.push({ from: passo.node.id, out: r.out, to: r.alvo.node.id, kind: "desvio" });
      colocarRamos(r.alvo, coluna);
    }
  };

  trilha.forEach((passo, coluna) => {
    colocar(passo.node.id, coluna, 0);
    if (passo.proximo?.to) edges.push({ from: passo.node.id, out: passo.proximo.out, to: passo.proximo.to, kind: "principal" });
    colocarRamos(passo, coluna);
  });

  const colunas = Math.max(1, trilha.length);
  const linhas = Math.max(1, ...[...proximaLinha.values()]);
  return {
    nodes,
    edges,
    width: PAD * 2 + (colunas - 1) * COL_PITCH + NODE_W,
    height: PAD * 2 + (linhas - 1) * ROW_PITCH + NODE_H,
  };
}
