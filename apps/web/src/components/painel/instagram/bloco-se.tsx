"use client";

import React from "react";
import { moveChoice, removeChoice } from "@/lib/ig/flow/choices-edit";
import { planConditionCheck } from "@/lib/ig/flow/blocks-edit";
import { rotuloDaSaida, tituloDoBloco } from "@/lib/ig/flow/labels";
import type { ConditionNode } from "@/lib/ig/flow/types";
import { ajuda, campo, nomeAcessivel, Problemas, rotulo, type FormProps } from "./bloco-comum";
import { ListaEditavel } from "./bloco-lista";
import { CampoDaFicha } from "./campo-da-ficha";
import { ChipsEtiqueta } from "./chips-etiqueta";

/** Valor de campo compara o texto inteiro da ficha, que pode ser resposta livre (mesmo teto do validador). */
const MAX_VALOR = 200;

/** "Segue a loja" e "Clicou no link" ainda não rodam (fase 3, fase.ts): aparecem desativados. */
const CONFERENCIAS = [
  ["field", "Campo da ficha", false],
  ["tag", "Etiqueta", false],
  ["follows", "Segue a loja (chega na fase 3)", true],
  ["clicked", "Clicou no link (chega na fase 3)", true],
] as const;

export function BlocoSe({ node, def, confirmar, issues, chaves, aoMudar, editarDef }: Pick<FormProps, "def" | "confirmar" | "issues" | "chaves" | "aoMudar" | "editarDef"> & { node: ConditionNode }) {
  const trocar = async (novo: "field" | "tag") => {
    const { lost } = planConditionCheck(def, node.id, novo);
    if (lost.length > 0) {
      const nomes = lost.map((o) => `“${rotuloDaSaida(o, node)}”`).join(", ");
      const ok = await confirmar({ titulo: "Trocar o que o Se… confere", texto: `As ligações das respostas ${nomes} vão ficar soltas. Os blocos delas não são apagados.`, rotulo: "Trocar" });
      if (!ok) return;
    }
    editarDef((d) => planConditionCheck(d, node.id, novo).def);
  };
  const nome = nomeAcessivel(tituloDoBloco(node), node.id);
  const doBloco = issues.filter((i) => i.nodeId === node.id);
  if (node.check === "follows") {
    return <p className="text-13 text-slate-600">Confere na hora se a pessoa segue a loja. Quem não segue recebe o pedido pra seguir e volta pra cá quando responder.</p>;
  }
  if (node.check === "clicked") {
    return <p className="text-13 text-slate-600">Confere se a pessoa já clicou em algum convite. Chega na fase 3.</p>;
  }
  const valores = node.values ?? [];
  return (
    <div className="grid gap-4">
      <label className="block">
        <span className={rotulo}>O que conferir</span>
        <select
          aria-label={nome("O que conferir")}
          value={node.check}
          onChange={(e) => void trocar(e.target.value === "tag" ? "tag" : "field")}
          className={`${campo} mt-1`}
        >
          {CONFERENCIAS.map(([valor, texto, desativado]) => <option key={valor} value={valor} disabled={desativado}>{texto}</option>)}
        </select>
      </label>
      {node.check === "field" ? (
        <>
          <div>
            <span className={rotulo}>Campo</span>
            <CampoDaFicha valor={node.field} chaves={chaves} rotulo={nome("Campo conferido")} idLista={`campos-${node.id}`} aoConfirmar={(chave) => aoMudar({ field: chave ?? "" })} />
          </div>
          <div>
            <span className={rotulo}>Valores <span className="font-normal text-slate-600">cada um vira uma saída; vale com ou sem acento</span></span>
            <div className="mt-1">
              <ListaEditavel
                itens={valores}
                rotuloItem="Valor"
                rotuloAdicionar="Adicionar valor"
                maxCaracteres={MAX_VALOR}
                aoEditar={(i, texto) => aoMudar({ values: valores.map((v, j) => (j === i ? texto : v)) })}
                aoAdicionar={() => aoMudar({ values: [...valores, ""] })}
                aoRemover={(i) => editarDef((d) => removeChoice(d, node.id, i))}
                aoMover={(de, para) => editarDef((d) => moveChoice(d, node.id, de, para))}
              />
            </div>
            <p className={ajuda}>Quem tem outro valor, ou o campo vazio, sai por “Outra resposta”.</p>
          </div>
        </>
      ) : (
        <div>
          <span className={rotulo}>Etiqueta</span>
          <div className="mt-1"><ChipsEtiqueta etiquetas={node.tag ? [node.tag] : []} max={1} rotulo={nome("Etiqueta conferida")} aoMudar={(lista) => aoMudar({ tag: lista[0] ?? "" })} /></div>
        </div>
      )}
      <Problemas issues={doBloco} />
    </div>
  );
}
