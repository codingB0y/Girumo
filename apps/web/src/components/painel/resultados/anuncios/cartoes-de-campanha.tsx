"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React, { useState } from "react";

import { alternado, cartaoDaCampanha, resumoDaLinha, type NoDaTabela } from "@/lib/resultados/anuncios-linhas";
import type { LinhaRelatorio } from "@/lib/resultados/relatorio-anuncios";
import { FunilEmPe } from "./mini-funil";

type Props = {
  arvore: readonly NoDaTabela[];
  onVerQuem: (linha: LinhaRelatorio) => void;
  /** Campanhas abertas na primeira pintura (o teste desenha sem clicar). */
  abertosDeInicio?: readonly string[];
};

/**
 * Mini-funil B (spec 2026-10-10-funil-anuncios §4, mockup Celular): abaixo de
 * 768 px a tabela não cabe, então cada campanha vira um cartão com funil em pé,
 * bico em R$, retorno, taxa de compra e custo por comprador. "Ver N conjuntos"
 * abre a lista de conjuntos e anúncios dentro do próprio cartão.
 */
export function CartoesDeCampanha({ arvore, onVerQuem, abertosDeInicio = [] }: Props) {
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set(abertosDeInicio));
  const alternar = (chave: string) => setAbertos((atual) => alternado(atual, chave));

  return (
    <section aria-labelledby="cartoes-titulo" className="flex flex-col gap-2.5">
      <h2 id="cartoes-titulo" className="font-brand text-20 font-bold text-volt-950">
        Por campanha
      </h2>
      {arvore.map((no) => {
        const c = cartaoDaCampanha(no);
        const aberto = abertos.has(no.chave);
        return (
          <article key={no.chave} aria-label={c.rotulo} className="rounded-xl border border-line-200 bg-paper-0 px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="min-w-0 text-15 font-semibold text-volt-950">{c.rotulo}</h3>
              <span className="font-data whitespace-nowrap text-13 text-slate-600">{`gasto ${c.gasto}`}</span>
            </div>
            {c.aviso && <p className="mt-1 text-13 text-slate-600">{c.aviso}</p>}
            <div className="mt-3">
              <FunilEmPe modelo={c.funil} rotulo={`Funil de ${c.rotulo}`} tamanho="cartao" />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-1 text-13">
              <div>
                <dt className="text-slate-600">Retorno</dt>
                <dd className="font-brand text-15 font-bold tabular-nums text-volt-950">{c.retorno}</dd>
              </div>
              <div>
                <dt className="text-slate-600">Compram</dt>
                <dd className="font-data text-volt-950">{c.compram}</dd>
              </div>
              <div>
                <dt className="text-slate-600">Por comprador</dt>
                <dd className="font-data text-volt-950">{c.porComprador}</dd>
              </div>
            </dl>
            {c.mais && (
              <button
                type="button"
                aria-expanded={aberto}
                onClick={() => alternar(no.chave)}
                className="mt-1 inline-flex min-h-11 items-center text-13 font-semibold text-cobalt-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
              >
                {aberto ? "Fechar conjuntos" : c.mais}
              </button>
            )}
            {aberto && (
              <ul aria-label={`Conjuntos de ${c.rotulo}`} className="mt-1 divide-y divide-line-200 border-t border-line-200">
                {no.filhos.map((conjunto) => (
                  <li key={conjunto.chave} className="py-2.5">
                    <p className="text-12 text-slate-600">{conjunto.tipo}</p>
                    <p className="text-15 font-semibold text-volt-950">{conjunto.rotulo}</p>
                    <p className="text-13 text-slate-600">{resumoDaLinha(conjunto.linha)}</p>
                    <ul className="mt-1.5 space-y-1 pl-3">
                      {conjunto.filhos.map((anuncio) => (
                        <li key={anuncio.chave} className="flex items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-15 text-volt-950">{anuncio.rotulo}</span>
                            <span className="block text-13 text-slate-600">{resumoDaLinha(anuncio.linha)}</span>
                          </span>
                          <button
                            type="button"
                            aria-label={`Ver quem veio por ${anuncio.rotulo}`}
                            onClick={() => onVerQuem(anuncio.linha)}
                            className="inline-flex min-h-11 flex-none items-center rounded-md border border-line-200 bg-paper-0 px-3 text-13 font-semibold text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
                          >
                            Ver quem
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </section>
  );
}
