"use client";

import React from "react";
import type { RespostaPronta } from "@/lib/ig/conversas/campo";
import { cn } from "@/lib/utils";
import type { CargaDasRespostas } from "./use-respostas-prontas";

export const ID_DA_LISTA = "ig-respostas-prontas";
export const idDaOpcao = (id: string): string => `ig-resposta-${id}`;

type Props = {
  /** Já filtradas pela consulta. */
  itens: RespostaPronta[];
  /** Quantas a loja tem no total (sem filtro): separa "nenhuma ainda" de "nenhuma com esse nome". */
  total: number;
  carga: CargaDasRespostas;
  ativo: number;
  podeGerenciar: boolean;
  aoEscolher: (r: RespostaPronta) => void;
  aoTentarDeNovo: () => void;
};

/**
 * A lista das respostas prontas, aberta pelo `/` ou pelo botão. O foco FICA no campo de texto (que é o combobox):
 * quem aponta a opção ativa é o `aria-activedescendant` dele. `onMouseDown` não deixa o clique roubar o foco.
 */
export function ListaDeRespostas({ itens, total, carga, ativo, podeGerenciar, aoEscolher, aoTentarDeNovo }: Props) {
  const aviso = (texto: string) => (
    <p role="status" className="rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 py-2 text-13 text-slate-600">
      {texto}
    </p>
  );
  if (carga === "carregando" || carga === "ocioso") return aviso("Carregando as respostas prontas…");
  if (carga === "erro") {
    return (
      <p role="alert" className="rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 py-2 text-13 text-danger-700">
        Não deu pra carregar as respostas prontas.{" "}
        <button type="button" onClick={aoTentarDeNovo} className="min-h-11 text-cobalt-500 lg:min-h-0">Tentar de novo</button>
      </p>
    );
  }
  if (total === 0) return aviso(podeGerenciar ? "Você ainda não tem respostas prontas. Crie a primeira em Gerenciar." : "A loja ainda não tem respostas prontas. O dono ou um admin cria em Gerenciar.");
  if (itens.length === 0) return aviso("Nenhuma resposta com esse nome.");
  return (
    <ul id={ID_DA_LISTA} role="listbox" aria-label="Respostas prontas" className="max-h-56 overflow-y-auto rounded-[var(--radius-control)] border border-line-200 bg-paper-0 py-1">
      {itens.map((r, i) => (
        <li
          key={r.id}
          id={idDaOpcao(r.id)}
          role="option"
          aria-selected={i === ativo}
          onMouseDown={(e) => {
            e.preventDefault();
            aoEscolher(r);
          }}
          className={cn("cursor-pointer px-3 py-2", i === ativo && "bg-canvas-100")}
        >
          <span className="block text-13 font-medium text-volt-950">{r.titulo}</span>
          <span className="block truncate text-12 text-slate-600">{r.texto}</span>
        </li>
      ))}
    </ul>
  );
}
