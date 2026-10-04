"use client";

import { canAddFollowGate, canAddReminder, hasFollowGate, hasReminder, setFollowGate, setReminder, updateNode } from "@/lib/ig/flow/edit";
import { rotuloDaSaida, tituloDoBloco } from "@/lib/ig/flow/labels";
import { linearize, type Passo, type Ramo } from "@/lib/ig/flow/linearize";
import { nodeById, triggerOf } from "@/lib/ig/flow/graph";
import type { FlowDef, FlowNode } from "@/lib/ig/flow/types";
import type { Issue } from "@/lib/ig/flow/validate";
import { BlocoForm, type CampanhaOpcao } from "./bloco-form";
import { ICONE } from "./icones";
import { Interruptor } from "./interruptor";

type Editar = (fn: (d: FlowDef) => FlowDef) => void;
type Contexto = { def: FlowDef; campanhas: CampanhaOpcao[]; issues: Issue[]; editar: Editar; primeiroDirectAposComentario: string | null };

/** Fora de `Trilha` de propósito: declarado dentro, o React remontaria o formulário a cada tecla. */
function Bloco({ ctx, node, indice, ramos, fim }: { ctx: Contexto; node: FlowNode; indice: number | null; ramos: Ramo[]; fim?: Passo["proximo"] }) {
  const { def, editar } = ctx;
  const Icone = ICONE[node.type];
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-4 border-t border-line-200 py-5 first:border-0">
      <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full border border-line-200 font-data text-13 text-slate-600">{indice ?? "↳"}</span>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-15 font-semibold text-volt-950">
          <Icone className="h-4 w-4 text-slate-600" strokeWidth={1.75} aria-hidden="true" />
          {tituloDoBloco(node)}
        </h3>
        <div className="mt-3 max-w-[560px]">
          <BlocoForm
            node={node}
            primeiroDepoisDoComentario={node.id === ctx.primeiroDirectAposComentario}
            campanhas={ctx.campanhas}
            issues={ctx.issues}
            aoMudar={(patch) => editar((d) => updateNode(d, node.id, patch))}
          />
        </div>
        {(ramos.length > 0 || fim) && (
          <ul className="mt-4 grid gap-2">
            {fim && !fim.to && (
              <li className="text-13 text-slate-600"><span className="font-medium text-volt-950">{rotuloDaSaida(fim.out, node)}</span> · Parou aqui</li>
            )}
            {ramos.map((r) => {
              const volta = r.volta ? nodeById(def, r.volta) : undefined;
              return (
                <li key={r.out} className="text-13 text-slate-600">
                  <span className="font-medium text-volt-950">{rotuloDaSaida(r.out, node)}</span>
                  {volta ? ` · volta pra “${tituloDoBloco(volta)}”` : r.alvo ? "" : " · parou aqui"}
                  {r.alvo && (
                    <ol className="mt-2 border-l-2 border-line-200 pl-4">
                      <Bloco ctx={ctx} node={r.alvo.node} indice={null} ramos={r.alvo.ramos} />
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}

export function Trilha({ def, campanhas, issues, editar }: { def: FlowDef; campanhas: CampanhaOpcao[]; issues: Issue[]; editar: Editar }) {
  const passos = linearize(def);
  // O segundo passo da trilha é o primeiro direct depois do gatilho de comentário (sem botão).
  const ctx: Contexto = { def, campanhas, issues, editar, primeiroDirectAposComentario: triggerOf(def)?.on === "comment" ? (passos[1]?.node.id ?? null) : null };
  const podeLembrar = hasReminder(def) || canAddReminder(def);

  return (
    <section aria-labelledby="roteiro" className="rounded-[10px] border border-line-200 bg-paper-0 px-5">
      <header className="flex h-12 items-center justify-between">
        <h2 id="roteiro" className="text-15 font-semibold text-volt-950">Roteiro</h2>
        <span className="text-12 text-slate-600">{passos.length} {passos.length === 1 ? "passo" : "passos"}</span>
      </header>
      <ol>
        {passos.map((p, i) => <Bloco key={p.node.id} ctx={ctx} node={p.node} indice={i + 1} ramos={p.ramos} fim={p.proximo} />)}
      </ol>
      <footer className="border-t border-line-200 py-4">
        <h3 className="text-13 font-semibold text-volt-950">Dá pra acrescentar <span className="font-normal text-slate-600">cada um vira um passo ou um desvio</span></h3>
        <ul className="mt-2 grid gap-3">
          {(hasFollowGate(def) || canAddFollowGate(def)) && (
            <li className="flex items-start justify-between gap-4">
              <span><span className="block text-13 font-medium text-volt-950">Pedir resposta e conferir se segue a loja</span><span className="text-12 text-slate-600">A resposta abre 24 h de conversa. Só recebe o link quem segue.</span></span>
              <Interruptor ligado={hasFollowGate(def)} aoMudar={(on) => editar((d) => setFollowGate(d, on))} rotulo="Pedir resposta e conferir se segue a loja" />
            </li>
          )}
          <li className="flex items-start justify-between gap-4">
            <span><span className="block text-13 font-medium text-volt-950">Lembrar quem não clicou</span><span className="text-12 text-slate-600">{podeLembrar ? "Um segundo direct com o link, horas depois." : "Precisa da resposta da pessoa antes: depois de um comentário só sai um direct."}</span></span>
            <Interruptor ligado={hasReminder(def)} aoMudar={(on) => editar((d) => setReminder(d, on))} rotulo="Lembrar quem não clicou" desabilitado={!podeLembrar} />
          </li>
        </ul>
      </footer>
    </section>
  );
}
