// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React from "react";

import { graficoPorDia, marcasDeGasto, type InicioDeGasto } from "@/lib/resultados/anuncios-tela";
import type { RelatorioParaTela } from "@/lib/resultados/relatorio-anuncios";
import { cn } from "@/lib/utils";

type Props = {
  porDia: RelatorioParaTela["por_dia"];
  /** Começos de lançamento de gasto no período (PR 7). Sem eles, nenhuma anotação. */
  inicios: readonly InicioDeGasto[];
};

/**
 * Cadastros × entraram por dia (spec §4), em colunas HTML como o `GraficoDeBarras`
 * da campanha: o texto do eixo fica em 12 px de verdade em qualquer largura. Duas
 * colunas por dia, lado a lado; o dia que começa um lançamento de gasto ganha um
 * traço com o nome da campanha.
 */
export function GraficoPorDia({ porDia, inicios }: Props) {
  const { dias, teto, resumo } = graficoPorDia(porDia);
  const marcas = marcasDeGasto(porDia, inicios);
  const altura = (v: number) => `${(v / teto) * 100}%`;

  return (
    <figure className="m-0 mt-4">
      <div className="flex gap-2">
        <div aria-hidden="true" className="relative h-44 w-7 shrink-0 text-right text-12 tabular-nums leading-none text-slate-600">
          {/* O meio só ganha número quando é inteiro: "2,5 cadastros" não existe. */}
          {[teto, teto / 2, 0].map((m, i) =>
            Number.isInteger(m) ? (
              <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>
                {m.toLocaleString("pt-BR")}
              </span>
            ) : null,
          )}
        </div>
        <div className="relative h-44 min-w-0 flex-1">
          <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
            <span className="block border-t border-dashed border-line-200" />
            <span className="block border-t border-dashed border-line-200" />
            <span className="block border-t border-slate-600/50" />
          </div>
          {/* `div`, não `ol`: `role="img"` apaga a semântica dos filhos e o axe acusa `li` órfão. */}
          <div role="img" aria-label={resumo} className="absolute inset-0 flex items-end gap-[3px]">
            {dias.map((d) => (
              <span key={d.chave} title={d.dica} className="flex h-full min-w-0 flex-1 items-end gap-px">
                <span
                  className="block flex-1 rounded-t-[2px] bg-cobalt-500/30"
                  style={{ height: altura(d.cadastros), minHeight: d.cadastros > 0 ? 2 : 0 }}
                />
                <span
                  className="block flex-1 rounded-t-[2px] bg-cobalt-500"
                  style={{ height: altura(d.entraram), minHeight: d.entraram > 0 ? 2 : 0 }}
                />
              </span>
            ))}
          </div>
          {marcas.map((m) => (
            <span
              key={m.chave}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 border-l border-dashed border-slate-600"
              style={{ left: `${m.posicao * 100}%` }}
            >
              <span
                className={cn(
                  "absolute top-0.5 whitespace-nowrap bg-paper-0 px-1 text-12 text-volt-950",
                  // Perto do fim, o rótulo cresce para a esquerda e não sai do cartão.
                  m.posicao > 0.6 ? "right-1.5" : "left-1.5",
                )}
              >
                {m.texto}
              </span>
            </span>
          ))}
        </div>
      </div>
      <ol aria-hidden="true" className="ml-9 mt-1.5 flex h-4 gap-[3px] text-12 text-slate-600">
        {dias.map((d) => (
          <li key={d.chave} className="relative min-w-0 flex-1">
            {d.mostraRotulo && (
              <span className="font-data absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{d.rotulo}</span>
            )}
          </li>
        ))}
      </ol>
      {marcas.length > 0 && <figcaption className="sr-only">{marcas.map((m) => m.texto).join(". ")}</figcaption>}
    </figure>
  );
}
