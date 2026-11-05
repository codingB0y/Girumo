"use client";

import React, { useState } from "react";
import type { RespostaPronta } from "@/lib/ig/conversas/campo";
import type { Resultado } from "./use-fio";

const TITULO_MAX = 40;
const TEXTO_MAX = 1000;
const CAIXA = "w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 py-2 text-14 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const BOTAO = "inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50 lg:min-h-9";

type Props = {
  respostas: RespostaPronta[];
  aoCriar: (titulo: string, texto: string) => Promise<Resultado>;
  aoApagar: (id: string) => Promise<Resultado>;
  aoFechar: () => void;
};

/** Criar e apagar respostas prontas. Só aparece para dono e admin (a rota também confere). Sem edição: apaga e cria. */
export function GerenciarRespostas({ respostas, aoCriar, aoApagar, aoFechar }: Props) {
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pronto = titulo.trim() !== "" && texto.trim() !== "";

  const rodar = async (acao: () => Promise<Resultado>, aoDarCerto?: () => void) => {
    setOcupado(true);
    setErro(null);
    const r = await acao();
    setOcupado(false);
    if (r.ok) aoDarCerto?.();
    else setErro(r.mensagem);
  };

  return (
    <section aria-label="Gerenciar respostas prontas" className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-14 font-semibold text-volt-950">Respostas prontas ({respostas.length}/50)</h3>
        <button type="button" onClick={aoFechar} className={BOTAO}>Fechar</button>
      </div>
      {respostas.length > 0 && (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {respostas.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-13 text-volt-950">{r.titulo}</span>
              <button type="button" disabled={ocupado} onClick={() => void rodar(() => aoApagar(r.id))} aria-label={`Apagar ${r.titulo}`} className={BOTAO}>Apagar</button>
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
          <input value={titulo} maxLength={TITULO_MAX} onChange={(e) => setTitulo(e.target.value)} className={CAIXA} />
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
