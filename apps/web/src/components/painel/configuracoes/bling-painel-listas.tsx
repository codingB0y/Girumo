// apps/web/src/components/painel/configuracoes/bling-painel-listas.tsx
"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de site-proprio-painel.tsx).
import React from "react";

import { Download, Loader2 } from "lucide-react";
import type { CartaoBling } from "@/lib/bling/cartao";
import { cn } from "@/lib/utils";
import { AJUDA, ANEL, BLOCO, SECUNDARIO, TITULO } from "./bling-painel-estilo";
import {
  contagem,
  LISTAS,
  NOMES_DAS_LISTAS,
  RECEITAS_DOS_PUBLICOS,
  regraDaLista,
  type ListaDoCartao,
  type Ocupado,
} from "./bling-painel-texto";

type PropsDasListas = {
  listas: NonNullable<CartaoBling["listas"]>;
  valorAlto: number | null;
  ocupado: Ocupado;
  onBaixar: (lista: ListaDoCartao) => void;
};

/**
 * Listas de clientes (mockup Listas): pessoas por lista, o CSV do histórico para o Meta e a
 * receita dos públicos. As vendas novas chegam ao Meta pelos eventos, não pelo CSV.
 */
export function ListasDoBling({ listas, valorAlto, ocupado, onBaixar }: PropsDasListas) {
  return (
    <section className={cn(BLOCO, "space-y-4")} aria-labelledby="bling-listas-titulo">
      <h3 id="bling-listas-titulo" className={TITULO}>
        Listas de clientes
      </h3>
      <ul className="grid gap-4 md:grid-cols-3">
        {LISTAS.map((l) => (
          <li key={l} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line-200 p-5">
            <p className="text-15 font-semibold text-volt-950">{NOMES_DAS_LISTAS[l]}</p>
            <p className="flex items-baseline gap-1.5">
              <span className="font-data text-28 tabular-nums text-volt-950">{contagem(listas[l])}</span>
              <span className="text-[14px] text-slate-600">clientes</span>
            </p>
            <p className="flex-1 text-13 text-slate-600">{regraDaLista(l, valorAlto)}</p>
            <button
              type="button"
              onClick={() => onBaixar(l)}
              disabled={ocupado !== null}
              aria-label={`Baixar CSV para o Meta: ${NOMES_DAS_LISTAS[l]}`}
              className={cn(SECUNDARIO, ANEL, "self-start text-[14px]")}
            >
              {ocupado === `csv:${l}` ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              Baixar CSV para o Meta
            </button>
          </li>
        ))}
      </ul>
      <p className="text-13 text-slate-600">Cada cliente fica em uma lista só; ao comprar, sai de Leads qualificados.</p>

      <div>
        <h4 className={TITULO}>Como criar os públicos no Meta (uma vez)</h4>
        {/* role="list": sem marcador, o Safari tira a semântica de lista do <ol>. */}
        <ol
          role="list"
          className="font-data mt-3 space-y-2 rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 p-4 text-13 text-volt-950"
        >
          {RECEITAS_DOS_PUBLICOS.map((r, i) => (
            <li key={r.nome} className="flex gap-2.5">
              <span className="shrink-0 text-slate-600" aria-hidden="true">{`${i + 1})`}</span>
              <span>
                <span className="font-medium">{r.nome}</span>
                {` = ${r.regra}`}
              </span>
            </li>
          ))}
        </ol>
        <p className={AJUDA}>Os públicos se atualizam sozinhos com cada venda. O CSV serve para as vendas de antes de conectar.</p>
      </div>
    </section>
  );
}
