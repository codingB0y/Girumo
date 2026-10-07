import type { FlowDef } from "./types";
import type { Issue } from "./validate";

/**
 * O que o motor só executa na fase 3: esperar resposta, "segue a loja?",
 * lembrete e desvio de quem não clicou. Dá pra montar no rascunho; não publica.
 */
export function foraDaFase(def: FlowDef): Issue[] {
  const issues: Issue[] = [];
  for (const n of def.nodes) {
    if (n.type === "message" && n.wait) issues.push({ code: "fase_seguinte", nodeId: n.id, text: "Esperar a resposta chega na próxima fase. Tire a espera ou use uma receita de um direct." });
    if (n.type === "condition") issues.push({ code: "fase_seguinte", nodeId: n.id, text: "“Segue a loja?” chega na próxima fase." });
    if (n.type === "invite" && n.remindAfterMinutes !== null) issues.push({ code: "fase_seguinte", nodeId: n.id, text: "O lembrete de quem não clicou chega na próxima fase." });
  }
  if (def.edges.some((e) => e.out === "clicked" || e.out === "not_clicked")) issues.push({ code: "fase_seguinte", nodeId: null, text: "Desvio por clique chega na próxima fase." });
  return issues;
}
