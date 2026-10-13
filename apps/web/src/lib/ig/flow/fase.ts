import type { FlowDef } from "./types";
import type { Issue } from "./validate";

/**
 * O que o motor ainda não executa: tudo que depende de relógio ("não
 * respondeu", lembrete, "não clicou") e "segue a loja?". Dá pra montar no
 * rascunho; não publica. Esperar a resposta já roda (fase 3a, 08/10): o run
 * retoma quando a pessoa responde no direct.
 */
export function foraDaFase(def: FlowDef): Issue[] {
  const issues: Issue[] = [];
  for (const n of def.nodes) {
    if (n.type === "message" && n.wait && def.edges.some((e) => e.from === n.id && e.out === "timeout")) {
      issues.push({ code: "fase_seguinte", nodeId: n.id, text: "O caminho de quem não respondeu chega na próxima fase. Tire essa ligação: quem não responde para aqui." });
    }
    if (n.type === "condition") issues.push({ code: "fase_seguinte", nodeId: n.id, text: "“Segue a loja?” chega na próxima fase." });
    if (n.type === "invite" && n.remindAfterMinutes !== null) issues.push({ code: "fase_seguinte", nodeId: n.id, text: "O lembrete de quem não clicou chega na próxima fase." });
  }
  if (def.edges.some((e) => e.out === "clicked" || e.out === "not_clicked")) issues.push({ code: "fase_seguinte", nodeId: null, text: "Desvio por clique chega na próxima fase." });
  return issues;
}
