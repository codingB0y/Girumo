import { triggerOf } from "./graph";
import type { FlowDef } from "./types";
import type { KeywordInUse } from "./validate";

/**
 * As palavras que já disparam outro fluxo no ar: a mesma palavra em dois fluxos daria dois directs.
 * Fluxo de qualquer mensagem entra como `any` (as palavras dele não contam).
 */
export function keywordsInUse(flows: readonly { id: string; published: FlowDef | null }[], exceptId: string): KeywordInUse[] {
  const lista: KeywordInUse[] = [];
  for (const flow of flows) {
    if (flow.id === exceptId || !flow.published) continue;
    const trigger = triggerOf(flow.published);
    if (!trigger) continue;
    if (trigger.anyMessage) {
      lista.push({ on: trigger.on, keyword: "", any: true });
      continue;
    }
    for (const keyword of trigger.keywords) lista.push({ on: trigger.on, keyword });
  }
  return lista;
}
