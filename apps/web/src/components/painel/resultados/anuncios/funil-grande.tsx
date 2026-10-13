// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React from "react";

import type { CSSProperties } from "react";

import {
  bicoDoTotal,
  clipDoDegrau,
  degrausDoTotal,
  FUNIL_CELULAR,
  FUNIL_COMPUTADOR,
  geometriaDoFunil,
  inteiro,
  notaDeJaMembros,
  type DegrauDoFunil,
} from "@/lib/resultados/anuncios-tela";
import type { RelatorioParaTela } from "@/lib/resultados/relatorio-anuncios";
import { cn } from "@/lib/utils";

/** Tons de cobalt que escurecem degrau a degrau (spec §4); o último leva texto claro. O mini-funil (PR 6) usa os mesmos. */
export const TOM_DO_DEGRAU = [
  "bg-cobalt-500/15 text-volt-950",
  "bg-cobalt-500/30 text-volt-950",
  "bg-cobalt-500/50 text-volt-950",
  "bg-cobalt-500 text-paper-0",
] as const;

/** Passagem | degrau | custo no computador; só o degrau, com o texto dentro, no celular. */
const LINHA =
  "grid grid-cols-1 items-center md:grid-cols-[minmax(96px,210px)_minmax(0,1fr)_minmax(96px,210px)] md:gap-x-5";

/**
 * Largura e fundo do degrau mudam com a tela: as duas geometrias vão em variáveis
 * CSS e a classe escolhe qual vale (`md:`), sem JavaScript medindo janela.
 */
function forma(computador: { largura: number; recuo: number }, celular: { largura: number; recuo: number }) {
  return {
    "--w": `${computador.largura}%`,
    "--clip": clipDoDegrau(computador.recuo),
    "--w-cel": `${celular.largura}%`,
    "--clip-cel": clipDoDegrau(celular.recuo),
  } as CSSProperties;
}

/** A linha de dentro do degrau no celular: "93% · R$ 4,97 cada". */
function linhaDoCelular(d: DegrauDoFunil): string {
  return [d.taxa, d.custo ? `${d.custo} cada` : null].filter(Boolean).join(" · ");
}

type Props = { total: RelatorioParaTela["total"]; descricaoDoPeriodo: string };

/**
 * O funil grande da aba Anúncios (spec §4, mockups Main e Celular): degraus que
 * afinam com o número de cada um, a passagem à esquerda, o custo à direita e o bico
 * verde com o vendido. O desenho é decorativo; tudo que ele diz está em texto.
 */
export function FunilGrande({ total, descricaoDoPeriodo }: Props) {
  const degraus = degrausDoTotal(total);
  const valores = degraus.map((d) => d.valor);
  const computador = geometriaDoFunil(valores, FUNIL_COMPUTADOR);
  const celular = geometriaDoFunil(valores, FUNIL_CELULAR);
  const bico = bicoDoTotal(total);
  const nota = notaDeJaMembros(total.ja_membros);

  return (
    <section aria-labelledby="funil-titulo" className="rounded-xl border border-line-200 bg-paper-0 px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="funil-titulo" className="font-brand text-20 font-bold text-volt-950">
          Do anúncio à venda
        </h2>
        <span className="text-13 text-slate-600">Quem se cadastrou {descricaoDoPeriodo}, acompanhado até hoje</span>
      </div>

      {total.cadastros === 0 ? (
        <p className="mt-4 text-15 text-slate-600">
          Nenhum cadastro com origem neste período. Escolha um período maior para ver o funil.
        </p>
      ) : (
        <>
          <div aria-hidden="true" className={cn(LINHA, "mt-4 hidden text-13 text-slate-600 md:grid")}>
            <span className="pb-2 text-right">Passagem do degrau</span>
            <span />
            <span className="pb-2">Custo de cada um</span>
          </div>
          <ol aria-label="Funil do anúncio à venda" className="mt-3 flex flex-col gap-[3px] md:mt-0 md:gap-1">
            {degraus.map((d, i) => (
              <li key={d.chave} className={LINHA}>
                <span className="hidden text-right text-13 text-slate-600 md:block">{d.passagem}</span>
                <div
                  className={cn(
                    "mx-auto flex h-[60px] w-[var(--w-cel)] flex-col items-center justify-center text-center [clip-path:var(--clip-cel)]",
                    "md:h-[76px] md:w-[var(--w)] md:[clip-path:var(--clip)]",
                    TOM_DO_DEGRAU[i],
                  )}
                  style={forma(computador[i], celular[i])}
                >
                  <span className="text-13 font-semibold md:flex md:flex-col md:items-center">
                    <span className="font-brand text-20 font-bold tabular-nums md:text-28">{inteiro(d.valor)}</span>{" "}
                    <span className="md:hidden">{d.rotuloCurto}</span>
                    <span className="hidden md:inline">{d.rotulo}</span>
                  </span>
                  {linhaDoCelular(d) && <span className="text-12 md:hidden">{linhaDoCelular(d)}</span>}
                </div>
                <span className="hidden text-13 md:block">
                  {d.custo ? (
                    <>
                      <span className="font-data text-volt-950">{d.custo}</span>{" "}
                      <span className="text-slate-600">{d.unidadeDoCusto}</span>
                    </>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </span>
              </li>
            ))}
            <li className={LINHA}>
              <span className="hidden text-right text-13 text-slate-600 md:block">{bico.esquerda}</span>
              <div
                className="mx-auto flex h-14 w-[var(--w-cel)] flex-col items-center justify-center rounded-b-lg bg-success-700 text-center text-paper-0 md:h-[68px] md:w-[var(--w)]"
                style={{ "--w": `${FUNIL_COMPUTADOR.bico}%`, "--w-cel": `${FUNIL_CELULAR.bico}%` } as CSSProperties}
              >
                <span className="font-brand text-20 font-bold tabular-nums">{bico.valor}</span>
                <span className="text-12 font-semibold md:text-13">
                  <span className="md:hidden">Vendido · {bico.pedidos}</span>
                  <span className="hidden md:inline">Vendido</span>
                </span>
              </div>
              <span className="hidden text-13 md:block">
                {bico.direita ? <span className="font-data text-volt-950">{bico.direita}</span> : <span className="text-slate-600">—</span>}
              </span>
            </li>
          </ol>
          {nota && <p className="mt-4 text-13 text-slate-600">{nota}</p>}
        </>
      )}
    </section>
  );
}
