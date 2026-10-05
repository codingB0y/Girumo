import type { FlowDef, FlowNode, FlowOut, TriggerNode } from "./types";

export function nodeById(def: FlowDef, id: string): FlowNode | undefined {
  return def.nodes.find((node) => node.id === id);
}

export function hasNode(def: FlowDef, id: string): boolean {
  return def.nodes.some((node) => node.id === id);
}

export function triggerOf(def: FlowDef): TriggerNode | undefined {
  return def.nodes.find((node): node is TriggerNode => node.type === "trigger");
}

/** O bloco em que a saída `out` de `from` chega; `null` quando o fluxo para ali. */
export function targetOf(def: FlowDef, from: string, out: FlowOut): string | null {
  return def.edges.find((edge) => edge.from === from && edge.out === out)?.to ?? null;
}

/** Os blocos que algum caminho a partir do gatilho alcança. */
export function reachableIds(def: FlowDef): Set<string> {
  const seen = new Set<string>();
  const start = triggerOf(def);
  if (!start) return seen;
  const stack = [start.id];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of def.edges) {
      if (edge.from === id && !seen.has(edge.to)) stack.push(edge.to);
    }
  }
  return seen;
}
