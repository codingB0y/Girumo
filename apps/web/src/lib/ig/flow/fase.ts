import type { FlowDef } from "./types";
import type { Issue } from "./validate";

/**
 * O que o motor ainda não executa: tudo que depende de relógio ("não
 * respondeu", lembrete, "não clicou"), "segue a loja?" e "clicou no link?". Dá pra montar no
 * rascunho; não publica. Esperar a resposta já roda (fase 3a, 08/10): o run
 * retoma quando a pessoa responde no direct.
 */
/**
 * O motor (PR 1c) ainda não executa Pergunta com escolhas, Etiqueta nem Se… campo/etiqueta.
 * O PR 1c liga isto trocando `false` por `true`, e só.
 */
export const MOTOR_DOS_BLOCOS_NOVOS = false;

export function foraDaFase(def: FlowDef): Issue[] {
  const issues: Issue[] = [];
  for (const n of def.nodes) {
    if (!MOTOR_DOS_BLOCOS_NOVOS) {
      const nova = n.type === "tag" || (n.type === "message" && !!n.choices?.length) || (n.type === "condition" && (n.check === "field" || n.check === "tag"));
      if (nova) issues.push({ code: "fase_seguinte", nodeId: n.id, text: "Este bloco chega na próxima fase: o robô ainda não executa pergunta com escolhas, etiqueta nem “Se…”." });
    }
    if (n.type === "message" && n.wait && def.edges.some((e) => e.from === n.id && e.out === "timeout")) {
      issues.push({ code: "fase_seguinte", nodeId: n.id, text: "O caminho de quem não respondeu chega na próxima fase. Tire essa ligação: quem não responde para aqui." });
    }
    if (n.type === "condition" && n.check === "follows") issues.push({ code: "fase_seguinte", nodeId: n.id, text: "“Segue a loja?” chega na próxima fase." });
    if (n.type === "condition" && n.check === "clicked") issues.push({ code: "fase_seguinte", nodeId: n.id, text: "“Clicou no link?” chega na próxima fase." });
    if (n.type === "invite" && n.remindAfterMinutes !== null) issues.push({ code: "fase_seguinte", nodeId: n.id, text: "O lembrete de quem não clicou chega na próxima fase." });
  }
  if (def.edges.some((e) => e.out === "clicked" || e.out === "not_clicked")) issues.push({ code: "fase_seguinte", nodeId: null, text: "Desvio por clique chega na próxima fase." });
  return issues;
}
