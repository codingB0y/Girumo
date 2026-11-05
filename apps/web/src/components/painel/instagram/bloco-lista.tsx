"use client";

import React, { useRef } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { MAX_CHOICES } from "@/lib/ig/flow/types";
import { campo } from "./bloco-comum";

const icone = "inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-slate-600 hover:text-volt-950 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

/**
 * Lista de escolhas de uma Pergunta ou de valores de um Se… (1 a 13). Editar o texto muda só o texto;
 * apagar e mover renumeram as ligações (quem chama usa `choices-edit.ts`).
 */
export function ListaEditavel({ itens, rotuloItem, rotuloAdicionar, maxCaracteres, aoEditar, aoAdicionar, aoRemover, aoMover }: {
  itens: string[];
  /** "Escolha" → nome acessível "Escolha 2". */
  rotuloItem: string;
  rotuloAdicionar: string;
  maxCaracteres: number;
  aoEditar: (i: number, texto: string) => void;
  aoAdicionar: () => void;
  aoRemover: (i: number) => void;
  aoMover: (de: number, para: number) => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  // Apagar tira o campo em que o foco estava: ele vai para o que ocupou o lugar (ou o último).
  const apagar = (i: number) => {
    aoRemover(i);
    requestAnimationFrame(() => {
      const campos = raiz.current?.querySelectorAll("input");
      campos?.[Math.min(i, campos.length - 1)]?.focus();
    });
  };
  return (
    <div ref={raiz}>
      <ol className="grid gap-2">
        {itens.map((item, i) => {
          const tamanho = [...item].length;
          return (
            <li key={i} className="flex items-center gap-1">
              <input
                aria-label={`${rotuloItem} ${i + 1}`}
                value={item}
                maxLength={maxCaracteres}
                onChange={(e) => aoEditar(i, e.target.value)}
                className={`${campo} min-w-0 flex-1`}
              />
              <span aria-hidden="true" className={`w-12 text-right font-data text-12 ${tamanho > maxCaracteres ? "text-warning-700" : "text-slate-600"}`}>{tamanho}/{maxCaracteres}</span>
              <button type="button" aria-label={`Subir ${rotuloItem.toLowerCase()} ${i + 1}`} disabled={i === 0} onClick={() => aoMover(i, i - 1)} className={icone}>
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Descer ${rotuloItem.toLowerCase()} ${i + 1}`} disabled={i === itens.length - 1} onClick={() => aoMover(i, i + 1)} className={icone}>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Apagar ${rotuloItem.toLowerCase()} ${i + 1}`} disabled={itens.length <= 1} onClick={() => apagar(i)} className={icone}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={aoAdicionar}
        disabled={itens.length >= MAX_CHOICES}
        className="mt-2 inline-flex h-8 items-center gap-1 text-13 font-medium text-volt-950 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {rotuloAdicionar}
        <span className="font-normal text-slate-600">{itens.length}/{MAX_CHOICES}</span>
      </button>
    </div>
  );
}
