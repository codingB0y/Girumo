import type { FlowDef, TriggerNode } from "@/lib/ig/flow/types";
import { matchKeyword } from "@/lib/ig/match-keyword";

export type FluxoNoAr = { id: string; version: number; published: FlowDef | null };
export type Origem = { kind: "comment"; postId: string; text: string } | { kind: "dm"; text: string } | { kind: "story"; text: string };
/** `qualquer`: o fluxo entrou por "qualquer mensagem", sem palavra (quem chama confere a conversa parada). */
export type Escolha = { flowId: string; version: number; def: FlowDef; trigger: TriggerNode; keyword: string; qualquer?: true };

/** O que fica em `ig_runs.matched_keyword` quando nenhuma palavra casou. */
export const QUALQUER_MENSAGEM = "qualquer mensagem";

function gatilhoDe(def: FlowDef): TriggerNode | null {
  const n = def.nodes.find((x) => x.type === "trigger");
  return n && n.type === "trigger" ? n : null;
}

/**
 * Post específico ganha de "qualquer post"; depois a palavra mais longa;
 * empate fica com o primeiro da lista. Comentário, direct e resposta a story
 * (gatilho com `storyReplies`) exigem a palavra (spec §4.1, decisão de 06/10),
 * exceto no gatilho de direct com "qualquer mensagem", que só vale sem palavra casada.
 */
export function escolherFluxo(fluxos: readonly FluxoNoAr[], origem: Origem): Escolha | null {
  let melhor: { escolha: Escolha; especifico: boolean } | null = null;
  // Qualquer mensagem é a última opção: só entra quando nenhuma palavra casou.
  let qualquer: Escolha | null = null;
  for (const f of fluxos) {
    if (!f.published) continue;
    const t = gatilhoDe(f.published);
    if (!t) continue;
    if (origem.kind === "comment") {
      if (t.on !== "comment") continue;
      if (t.postId && t.postId !== origem.postId) continue;
    } else {
      if (t.on !== "dm") continue;
      if (origem.kind === "story" && !t.storyReplies) continue;
      if (t.anyMessage) {
        qualquer ??= { flowId: f.id, version: f.version, def: f.published, trigger: t, keyword: QUALQUER_MENSAGEM, qualquer: true };
        continue;
      }
    }
    const keyword = matchKeyword(origem.text, t.keywords);
    if (!keyword) continue;
    const especifico = origem.kind === "comment" && t.postId !== null;
    const candidato = { escolha: { flowId: f.id, version: f.version, def: f.published, trigger: t, keyword }, especifico };
    const ganha =
      !melhor ||
      (candidato.especifico && !melhor.especifico) ||
      (candidato.especifico === melhor.especifico && keyword.length > melhor.escolha.keyword.length);
    if (ganha) melhor = candidato;
  }
  return melhor?.escolha ?? qualquer;
}
