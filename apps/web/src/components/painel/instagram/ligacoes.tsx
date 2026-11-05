"use client";

import { linkOut } from "@/lib/ig/flow/blocks-edit";
import { targetOf } from "@/lib/ig/flow/graph";
import { rotuloDaSaida, tituloDoBloco } from "@/lib/ig/flow/labels";
import { outsOf, type FlowDef, type FlowNode } from "@/lib/ig/flow/types";
import { campo, rotulo } from "./bloco-comum";

/** Só os blocos de escolha ligam cada saída à mão; os outros seguem as receitas e os interruptores. */
export const temLigacaoLivre = (node: FlowNode): boolean =>
  (node.type === "message" && !!node.choices?.length) || (node.type === "condition" && (node.check === "field" || node.check === "tag"));

/** "Para onde vai cada resposta": uma lista de destinos por saída do bloco. */
export function Ligacoes({ def, node, editar }: { def: FlowDef; node: FlowNode; editar: (fn: (d: FlowDef) => FlowDef) => void }) {
  const destinos = def.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.type !== "trigger" && n.id !== node.id);
  return (
    <fieldset className="mt-4 grid gap-2">
      <legend className={rotulo}>Para onde vai cada resposta</legend>
      {outsOf(node).map((out) => {
        const atual = targetOf(def, node.id, out) ?? "";
        return (
          <label key={out} className="grid items-center gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-3">
            <span className="text-13 text-slate-600">{rotuloDaSaida(out, node)}</span>
            <select
              aria-label={`Destino de “${rotuloDaSaida(out, node)}” em ${tituloDoBloco(node)} (${node.id})`}
              value={atual}
              onChange={(e) => editar((d) => linkOut(d, node.id, out, e.target.value || null))}
              className={campo}
            >
              <option value="">{out === "other" ? "Continua esperando uma resposta que case" : "Parar aqui"}</option>
              {destinos.map(({ n, i }) => <option key={n.id} value={n.id}>{`${i + 1}. ${tituloDoBloco(n)}`}</option>)}
            </select>
          </label>
        );
      })}
    </fieldset>
  );
}
