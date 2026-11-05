import React from "react";
import { linearize } from "@/lib/ig/flow/linearize";
import { triggerOf } from "@/lib/ig/flow/graph";
import type { FlowDef } from "@/lib/ig/flow/types";

/** "Como a cliente vê": comentário, resposta pública e os directs da trilha principal. Claro de propósito: é o Instagram, não o painel. */
export function Previa({ def, handle }: { def: FlowDef; handle: string | null }) {
  const trigger = triggerOf(def);
  const palavra = trigger?.keywords[0] ?? "quero";
  const directs = linearize(def).map((p) => p.node).filter((n) => n.type === "message" || n.type === "invite" || n.type === "handoff");
  const loja = handle ?? "sua loja";
  return (
    <section aria-labelledby="previa" className="rounded-[10px] border border-line-200 bg-paper-0">
      <h2 id="previa" className="flex h-12 items-center px-5 text-15 font-semibold text-volt-950">Como a cliente vê</h2>
      <div className="rounded-b-[10px] bg-white px-4 py-3 text-13 text-[#262626]">
        {trigger?.on === "comment" && (
          <>
            <p className="text-12 text-[#737373]">No post</p>
            <p className="mt-1"><b>cliente</b> {palavra}</p>
            {trigger.publicReply && <p className="mt-1 pl-4"><b>{loja}</b> {trigger.publicReply}</p>}
          </>
        )}
        <p className="mt-3 text-12 text-[#737373]">No direct</p>
        {directs.map((n, i) => {
          if (n.type === "handoff") {
            return (
              <div key={n.id}>
                {n.text && <div className="mt-2 max-w-[85%] overflow-hidden rounded-xl bg-[#efefef]"><p className="px-3 py-2">{n.text}</p></div>}
                <p className="mt-2 w-fit rounded border border-dashed border-[#9aa0a6] px-1.5 py-0.5 text-12 text-[#5f6368]">Passa pra loja</p>
              </div>
            );
          }
          const botao = n.type === "invite" ? (n.button ?? null) : n.button;
          const escolhas = n.type === "message" ? (n.choices ?? []).filter((c) => c.trim()) : [];
          // 1º direct depois de comentário: o Instagram recusa interativo, então as escolhas valem só digitando.
          const respostasRapidas = trigger?.on === "comment" && i === 0 ? [] : escolhas;
          return (
            <div key={n.id}>
              <div className="mt-2 max-w-[85%] overflow-hidden rounded-xl bg-[#efefef]">
                <p className="px-3 py-2">
                  {n.text || <span className="text-[#737373]">(sem texto ainda)</span>}
                  {n.type === "invite" && !botao && <span className="ml-1 rounded border border-dashed border-[#9aa0a6] px-1 text-12 text-[#5f6368]">link da campanha</span>}
                </p>
                {botao && <p className="border-t border-[#dbdbdb] px-3 py-2 text-center font-semibold text-[#0095f6]">{botao}</p>}
              </div>
              {respostasRapidas.length > 0 && (
                <ul aria-label="Respostas rápidas" className="mt-2 flex flex-wrap gap-1.5">
                  {respostasRapidas.map((c, j) => <li key={j} className="rounded-full border border-[#0095f6] px-3 py-1 text-12 font-semibold text-[#0095f6]">{c}</li>)}
                </ul>
              )}
              {n.type === "message" && n.wait && (
                <p className="ml-auto mt-2 w-fit max-w-[85%] rounded-xl bg-[#3797f0] px-3 py-2 text-white">{escolhas[0] ?? n.wait.keywords?.[0] ?? "responde"}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
