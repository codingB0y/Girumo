"use client";

import React, { useEffect, useRef, useState } from "react";
import type { RespostaPronta } from "@/lib/ig/conversas/campo";
import type { Resultado } from "./use-fio";
import type { CargaDasRespostas } from "./use-respostas-prontas";

const TITULO_MAX = 40;
const TEXTO_MAX = 1000;
const CAIXA = "w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 py-2 text-14 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const BOTAO = "inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50 lg:min-h-9";
const ID_TITULO = "ig-gerenciar-respostas-titulo";

type Props = {
  respostas: RespostaPronta[];
  carga: CargaDasRespostas;
  aoCriar: (titulo: string, texto: string) => Promise<Resultado>;
  aoApagar: (id: string) => Promise<Resultado>;
  aoTentarDeNovo: () => void;
  /** Fecha o painel; quem o abriu devolve o foco ao botão. */
  aoFechar: () => void;
};

/** Criar e apagar respostas prontas. Só aparece para dono e admin (a rota também confere). Sem edição: apaga e cria. */
export function GerenciarRespostas({ respostas, carga, aoCriar, aoApagar, aoTentarDeNovo, aoFechar }: Props) {
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Apagar pede um segundo clique no mesmo botão ("Apagar mesmo?"); nada de window.confirm.
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const primeiro = useRef<HTMLInputElement>(null);
  const pronto = titulo.trim() !== "" && texto.trim() !== "";

  useEffect(() => primeiro.current?.focus(), []);

  const rodar = async (acao: () => Promise<Resultado>, aoDarCerto?: () => void) => {
    setOcupado(true);
    setErro(null);
    const r = await acao();
    setOcupado(false);
    if (r.ok) aoDarCerto?.();
    else setErro(r.mensagem);
  };

  const apagar = (r: RespostaPronta) => {
    if (confirmando !== r.id) return setConfirmando(r.id);
    setConfirmando(null);
    void rodar(() => aoApagar(r.id));
  };

  return (
    <section
      aria-labelledby={ID_TITULO}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          aoFechar();
        }
      }}
      className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={ID_TITULO} className="text-14 font-semibold text-volt-950">Gerenciar respostas prontas{carga === "ok" && ` (${respostas.length}/50)`}</h3>
        <button type="button" onClick={aoFechar} className={BOTAO}>Fechar</button>
      </div>
      {carga !== "ok" && carga !== "erro" && <p role="status" className="text-13 text-slate-600">Carregando as respostas prontas…</p>}
      {carga === "erro" && (
        <p role="alert" className="text-13 text-danger-700">
          Não deu pra carregar as respostas prontas. <button type="button" onClick={aoTentarDeNovo} className="min-h-11 text-cobalt-500 lg:min-h-0">Tentar de novo</button>
        </p>
      )}
      {carga === "ok" && respostas.length > 0 && (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {respostas.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-13 text-volt-950">{r.titulo}</span>
              <button type="button" disabled={ocupado} onClick={() => apagar(r)} onBlur={() => setConfirmando((c) => (c === r.id ? null : c))} aria-label={confirmando === r.id ? `Apagar ${r.titulo} mesmo?` : `Apagar ${r.titulo}`} className={BOTAO}>
                {confirmando === r.id ? "Apagar mesmo?" : "Apagar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (pronto && !ocupado) void rodar(() => aoCriar(titulo.trim(), texto.trim()), () => (setTitulo(""), setTexto("")));
        }}
      >
        <label className="flex flex-col gap-1 text-13 font-medium text-volt-950">
          Título
          <input ref={primeiro} value={titulo} maxLength={TITULO_MAX} onChange={(e) => setTitulo(e.target.value)} className={CAIXA} />
        </label>
        <label className="flex flex-col gap-1 text-13 font-medium text-volt-950">
          Texto da resposta
          <textarea value={texto} maxLength={TEXTO_MAX} rows={3} onChange={(e) => setTexto(e.target.value)} className={`${CAIXA} resize-none`} />
        </label>
        {erro && <p role="alert" className="text-13 text-danger-700">{erro}</p>}
        <div>
          <button type="submit" disabled={!pronto || ocupado} className={`${BOTAO} border-cobalt-500 bg-cobalt-500 text-paper-0`}>{ocupado ? "Salvando…" : "Criar resposta"}</button>
        </div>
      </form>
    </section>
  );
}
