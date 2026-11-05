"use client";

import { Plus } from "lucide-react";
import { insertAfter, type NovoBloco } from "@/lib/ig/flow/blocks-edit";
import type { FlowDef } from "@/lib/ig/flow/types";

const OPCOES: [NovoBloco, string][] = [
  ["pergunta", "Pergunta com escolhas"],
  ["etiqueta", "Etiqueta"],
  ["se", "Se…"],
];
const OPCAO_LOJA: [NovoBloco, string] = ["loja", "Passar pra loja"];

/** "Depois deste passo": o bloco entra na saída principal e o que vinha depois passa a vir depois dele. */
export function AdicionarBloco({ depoisDe, naPrimeiraResposta, fimDeCaminho, editar }: { depoisDe: string; naPrimeiraResposta: boolean; /** Passar pra loja encerra o caminho: só aparece onde nada vem depois. */ fimDeCaminho: boolean; editar: (fn: (d: FlowDef) => FlowDef) => void }) {
  const quando = naPrimeiraResposta ? "da 1ª resposta" : "depois";
  return (
    <div role="group" aria-label={`Adicionar ${quando} do passo ${depoisDe}`} className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-12 text-slate-600">{naPrimeiraResposta ? "Adicionar depois da 1ª resposta:" : "Adicionar depois:"}</span>
      {(fimDeCaminho ? [...OPCOES, OPCAO_LOJA] : OPCOES).map(([tipo, texto]) => (
        <button
          key={tipo}
          type="button"
          aria-label={`Adicionar ${texto} ${quando} do passo ${depoisDe}`}
          onClick={() => editar((d) => insertAfter(d, depoisDe, tipo))}
          className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-control)] border border-line-200 px-2.5 text-13 text-volt-950 hover:bg-hover-ficha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {texto}
        </button>
      ))}
    </div>
  );
}
