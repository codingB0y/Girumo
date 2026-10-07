import type { FlowDef, TriggerNode } from "@/lib/ig/flow/types";
import { matchKeyword } from "@/lib/ig/match-keyword";

export type FluxoNoAr = { id: string; version: number; published: FlowDef | null };
export type Origem = { kind: "comment"; postId: string; text: string } | { kind: "dm"; text: string } | { kind: "story"; text: string };
export type Escolha = { flowId: string; version: number; def: FlowDef; trigger: TriggerNode; keyword: string };

function gatilhoDe(def: FlowDef): TriggerNode | null {
  const n = def.nodes.find((x) => x.type === "trigger");
  return n && n.type === "trigger" ? n : null;
}

/**
 * Post específico ganha de "qualquer post"; depois a palavra mais longa;
 * empate fica com o primeiro da lista. Comentário, direct e resposta a story
 * (gatilho com `storyReplies`) exigem a palavra (spec §4.1, decisão de 06/10).
 */
export function escolherFluxo(fluxos: readonly FluxoNoAr[], origem: Origem): Escolha | null {
  let melhor: { escolha: Escolha; especifico: boolean } | null = null;
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
  return melhor?.escolha ?? null;
}
