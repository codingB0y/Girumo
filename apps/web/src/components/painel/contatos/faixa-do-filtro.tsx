import React from "react";

import type { Carga } from "@/lib/painel/types";
import { SEM_ANUNCIO, type ChaveDoAnuncio, type ListaDePessoas } from "@/lib/resultados/pessoas-do-anuncio";

const BOTAO =
  "inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-3.5 text-15 font-semibold text-volt-950 hover:bg-canvas-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

export function tituloDoFiltro(chave: ChaveDoAnuncio, lista: ListaDePessoas): string {
  const anuncio = chave.anuncio ?? SEM_ANUNCIO;
  return lista === "compraram"
    ? `Quem comprou pelo anúncio “${anuncio}”`
    : `Quem entrou pelo anúncio “${anuncio}” e ainda não comprou`;
}

/** O vazio do filtro: a lista inteira tem gente, este recorte é que não tem. */
export function textoDoFiltroVazio(lista: ListaDePessoas): string {
  return lista === "compraram"
    ? "Ninguém deste anúncio está em Contatos com compra neste período."
    : "Ninguém que entrou por este anúncio está sem compra neste período.";
}

type Props = {
  titulo: string;
  carga: Carga;
  /** Texto do vazio do filtro (lista carregada e sem ninguém); `null` com gente na lista. */
  vazio: string | null;
  aoTentarDeNovo: () => void;
  aoVerTodos: () => void;
};

/**
 * A faixa do Contatos filtrado pela gaveta "Ver quem" (Resultados › Anúncios):
 * diz de qual anúncio é o recorte e volta à lista inteira. Erro nunca vira lista
 * vazia (padrão `carga` da Vitrine).
 */
export function FaixaDoFiltro({ titulo, carga, vazio, aoTentarDeNovo, aoVerTodos }: Props) {
  const erro = carga === "erro";
  return (
    <div className="px-4 pt-5 lg:px-8">
      <div
        role={erro ? "alert" : "status"}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-200 bg-paper-0 px-4 py-3"
      >
        <div>
          <p className="text-15 text-volt-950">{erro ? "Não deu para carregar quem veio por este anúncio." : titulo}</p>
          {!erro && vazio && <p className="mt-1 text-13 text-slate-600">{vazio}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {erro && (
            <button type="button" onClick={aoTentarDeNovo} className={BOTAO}>
              Tentar de novo
            </button>
          )}
          <button type="button" onClick={aoVerTodos} className={BOTAO}>
            Ver todos os contatos
          </button>
        </div>
      </div>
    </div>
  );
}
