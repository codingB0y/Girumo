import React from "react";

type Props = {
  /** "Não deu para carregar …" — diz O QUE não veio. */
  titulo: string;
  aoTentarDeNovo: () => void;
};

/**
 * Quando a carga falha (rede, sessão expirada, 5xx): avisa e oferece tentar de
 * novo. É o que separa "não deu para ler" de "não existe" — um `[]` no lugar do
 * erro fazia a tela dizer "sem contatos" ou "campanha não encontrada" a quem tem.
 * Mesmo desenho do erro de Campanhas e Páginas.
 */
export function ErroDeCarga({ titulo, aoTentarDeNovo }: Props) {
  return (
    <div role="alert" className="pn-card rounded-[var(--radius-control)] p-6">
      <p className="text-15 text-volt-950">{titulo}</p>
      <p className="mt-1 text-13 text-slate-600">
        A conexão pode ter caído no meio do caminho. Nada foi apagado.
      </p>
      <button
        type="button"
        onClick={aoTentarDeNovo}
        className="mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100"
      >
        Tentar de novo
      </button>
    </div>
  );
}
