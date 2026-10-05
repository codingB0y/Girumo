import { triggerOf } from "./graph";
import type { FlowDef } from "./types";

/** As palavras que já disparam outro fluxo no ar: a mesma palavra em dois fluxos daria dois directs. */
export function keywordsInUse(flows: readonly { id: string; published: FlowDef | null }[], exceptId: string): { on: "comment" | "dm"; keyword: string }[] {
  const lista: { on: "comment" | "dm"; keyword: string }[] = [];
  for (const flow of flows) {
    if (flow.id === exceptId || !flow.published) continue;
    const trigger = triggerOf(flow.published);
    if (!trigger) continue;
    for (const keyword of trigger.keywords) lista.push({ on: trigger.on, keyword });
  }
  return lista;
}
