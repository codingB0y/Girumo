"use client";

import { useState } from "react";

const BOTAO = "inline-flex h-9 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50";

type Props = {
  selecionadas: number;
  /** Total que o filtro acha (todas as páginas). */
  totalDoFiltro: number;
  todosOsFiltrados: boolean;
  ocupado: boolean;
  aoSelecionarTodosOsFiltrados: () => void;
  aoAplicar: (acao: "add" | "remove", etiqueta: string) => void;
  aoLimpar: () => void;
};

/** Pôr/tirar etiqueta nos selecionados ou em todos os filtrados. */
export function AcoesEmMassa({ selecionadas, totalDoFiltro, todosOsFiltrados, ocupado, aoSelecionarTodosOsFiltrados, aoAplicar, aoLimpar }: Props) {
  const [etiqueta, setEtiqueta] = useState("");
  const alvo = todosOsFiltrados ? totalDoFiltro : selecionadas;
  const podeEstender = !todosOsFiltrados && totalDoFiltro > selecionadas;
  return (
    <div role="region" aria-label="Ações em massa" className="flex flex-wrap items-center gap-3 border-b border-line-200 bg-canvas-100 px-5 py-2.5 text-13">
      <span className="font-medium text-volt-950">
        {alvo} {alvo === 1 ? "selecionada" : "selecionadas"}
      </span>
      {podeEstender && (
        <button type="button" onClick={aoSelecionarTodosOsFiltrados} className="text-cobalt-500">
          Selecionar as {totalDoFiltro} do filtro
        </button>
      )}
      <input
        aria-label="Etiqueta para pôr ou tirar"
        placeholder="etiqueta"
        value={etiqueta}
        maxLength={80}
        onChange={(e) => setEtiqueta(e.target.value)}
        className="h-9 w-40 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-2 text-13 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      />
      <button type="button" disabled={ocupado || !etiqueta.trim()} onClick={() => aoAplicar("add", etiqueta)} className={BOTAO}>Pôr etiqueta</button>
      <button type="button" disabled={ocupado || !etiqueta.trim()} onClick={() => aoAplicar("remove", etiqueta)} className={BOTAO}>Tirar etiqueta</button>
      <button type="button" onClick={aoLimpar} className="text-slate-600">Limpar seleção</button>
    </div>
  );
}
