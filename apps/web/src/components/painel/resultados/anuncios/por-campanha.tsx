"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React, { useCallback, useMemo, useState } from "react";

import { arvoreDasLinhas, chaveDaLinha } from "@/lib/resultados/anuncios-linhas";
import type { LinhaRelatorio, RelatorioParaTela } from "@/lib/resultados/relatorio-anuncios";
import { CartoesDeCampanha } from "./cartoes-de-campanha";
import { GavetaDoAnuncio } from "./gaveta-do-anuncio";
import { TabelaDeAnuncios } from "./tabela-de-anuncios";

/**
 * Campanha › conjunto › anúncio na aba Anúncios (spec 2026-10-10-funil-anuncios
 * §4): a tabela no computador, os cartões B abaixo de 768 px e uma gaveta só,
 * aberta por "Ver quem" de qualquer um dos dois.
 */
export function PorCampanha({ relatorio }: { relatorio: RelatorioParaTela }) {
  // A gaveta fica presa ao relatório em que foi aberta: relatório novo (outro
  // período, gasto relançado pelo PR 7) fecha a gaveta em vez de mostrar a linha
  // velha com números que a tabela já não tem. Estado derivado, sem efeito.
  const [aberto, setAberto] = useState<{ linha: LinhaRelatorio; relatorio: RelatorioParaTela } | null>(null);
  const anuncio = aberto?.relatorio === relatorio ? aberto.linha : null;
  const verQuem = useCallback((linha: LinhaRelatorio) => setAberto({ linha, relatorio }), [relatorio]);
  const fechar = useCallback(() => setAberto(null), []);
  const arvore = useMemo(() => arvoreDasLinhas(relatorio.linhas), [relatorio.linhas]);

  if (arvore.length === 0) return null;

  return (
    <>
      <section aria-labelledby="tabela-titulo" className="hidden rounded-xl border border-line-200 bg-paper-0 pb-2 pt-5 md:block">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3.5">
          <h2 id="tabela-titulo" className="font-brand text-20 font-bold text-volt-950">
            Por campanha, conjunto e anúncio
          </h2>
          <span className="text-13 text-slate-600">Gasto é por campanha. Conjunto e anúncio mostram o que trouxeram.</span>
        </div>
        <TabelaDeAnuncios arvore={arvore} total={relatorio.total} onVerQuem={verQuem} />
      </section>
      <div className="md:hidden">
        <CartoesDeCampanha arvore={arvore} onVerQuem={verQuem} />
      </div>
      <GavetaDoAnuncio
        key={anuncio ? JSON.stringify(chaveDaLinha(anuncio)) : "fechada"}
        linha={anuncio}
        periodo={relatorio.periodo}
        aoFechar={fechar}
      />
    </>
  );
}
