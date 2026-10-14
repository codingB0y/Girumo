// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React from "react";

import { miniFunilA, type Contas, type FunilEmPeModelo } from "@/lib/resultados/anuncios-linhas";
import { inteiro } from "@/lib/resultados/anuncios-tela";
import { cn } from "@/lib/utils";
import { TOM_DO_DEGRAU } from "./funil-grande";

/**
 * Mini-funil A (spec 2026-10-10-funil-anuncios §4, mockup MiniFunil): quatro
 * degraus deitados, cada um com a altura relativa aos cadastros da própria
 * linha, e a taxa de compra na ponta. O desenho é decorativo: o número de cada
 * degrau fica no `title` (passar o mouse) e o funil inteiro em texto para o
 * leitor de tela.
 */
export function MiniFunilA({ contas }: { contas: Contas }) {
  const m = miniFunilA(contas);
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="flex h-10 flex-none items-center gap-0.5">
        {m.segmentos.map((s, i) => (
          <span
            key={s.titulo}
            title={s.titulo}
            className={cn("block h-10 w-11", TOM_DO_DEGRAU[i])}
            style={{ clipPath: s.clip }}
          />
        ))}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-brand text-15 font-bold tabular-nums text-volt-950">{m.taxa}</span>
        <span className="text-12 text-slate-600">compram</span>
      </span>
      <span className="sr-only">{m.leitor}</span>
    </div>
  );
}

type PropsDoFunilEmPe = { modelo: FunilEmPeModelo; rotulo: string; tamanho: "cartao" | "gaveta" };

/**
 * Funil em pé pequeno, com o texto dentro do degrau: o cartão B do celular e a
 * gaveta do anúncio. Na gaveta, a passagem fica à esquerda e o bico diz
 * "Vendido"; no cartão, só o valor.
 */
export function FunilEmPe({ modelo, rotulo, tamanho }: PropsDoFunilEmPe) {
  const gaveta = tamanho === "gaveta";
  const linha = gaveta ? "grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3" : "flex";
  return (
    <ol aria-label={rotulo} className={cn("flex flex-col", gaveta ? "gap-[3px]" : "gap-0.5")}>
      {modelo.degraus.map((d, i) => (
        <li key={d.chave} className={linha}>
          {gaveta && <span className="text-right text-13 text-slate-600">{d.passagem}</span>}
          <div
            className={cn(
              "mx-auto flex items-center justify-center gap-1.5 text-center",
              gaveta ? "h-[52px]" : "h-9",
              TOM_DO_DEGRAU[i],
            )}
            style={{ width: `${d.largura}%`, clipPath: d.clip }}
          >
            <span className={cn("font-brand font-bold tabular-nums", gaveta ? "text-20" : "text-15")}>
              {inteiro(d.valor)}
            </span>
            <span className="text-13 font-semibold">{d.rotulo}</span>
          </div>
        </li>
      ))}
      <li className={linha}>
        {gaveta && <span className="text-right text-13 text-slate-600">{modelo.bico.pedidos}</span>}
        <div
          className={cn(
            "mx-auto flex flex-col items-center justify-center rounded-b-lg bg-success-700 text-paper-0",
            gaveta ? "h-[52px]" : "h-[34px]",
          )}
          style={{ width: `${modelo.bico.largura}%` }}
        >
          <span className="font-brand text-15 font-bold tabular-nums">{modelo.bico.valor}</span>
          {gaveta ? (
            <span className="text-12 font-semibold">Vendido</span>
          ) : (
            <span className="sr-only">vendido</span>
          )}
        </div>
      </li>
    </ol>
  );
}
