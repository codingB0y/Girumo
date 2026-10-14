"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React, { useState } from "react";

import {
  alternado,
  colunasDaLinha,
  linhasVisiveis,
  type Contas,
  type NoDaTabela,
} from "@/lib/resultados/anuncios-linhas";
import type { LinhaRelatorio } from "@/lib/resultados/relatorio-anuncios";
import { cn } from "@/lib/utils";
import { MiniFunilA } from "./mini-funil";

type Props = {
  arvore: readonly NoDaTabela[];
  total: Contas;
  onVerQuem: (linha: LinhaRelatorio) => void;
  /** Chaves abertas na primeira pintura (o teste desenha sem clicar). */
  abertosDeInicio?: readonly string[];
};

const COLUNAS_DE_NUMERO = ["Gasto", "Cadastros", "Compraram", "Vendido", "Retorno"] as const;
const NUMERO = "font-data px-3 py-3 text-right tabular-nums";
const BOTAO_PEQUENO =
  "inline-flex flex-none items-center rounded-md text-13 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

/**
 * Tabela campanha › conjunto › anúncio (spec 2026-10-10-funil-anuncios §4, mockup
 * Main): abre e fecha por nível, mini-funil A em cada linha, gasto e retorno só na
 * campanha (conjunto e anúncio mostram "—"). "Ver quem" só no anúncio: abre a gaveta.
 */
export function TabelaDeAnuncios({ arvore, total, onVerQuem, abertosDeInicio = [] }: Props) {
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set(abertosDeInicio));
  const alternar = (chave: string) => setAbertos((atual) => alternado(atual, chave));
  const doTotal = colunasDaLinha(total);

  return (
    <div className="overflow-x-auto">
      <table
        aria-label="Resultado por campanha, conjunto e anúncio"
        className="w-full min-w-[980px] border-collapse text-15 text-volt-950"
      >
        <thead>
          <tr className="border-y border-line-200 bg-canvas-100 text-13 text-slate-600">
            <th scope="col" className="py-2.5 pl-5 pr-3 text-left font-medium">
              Campanha › conjunto › anúncio
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Do cadastro à compra
            </th>
            {COLUNAS_DE_NUMERO.map((c) => (
              <th key={c} scope="col" className="px-3 py-2.5 text-right font-medium last:pr-5">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhasVisiveis(arvore, abertos).map(({ no, profundidade, aberto }) => {
            const col = colunasDaLinha(no.linha);
            return (
              <tr key={no.chave} className={cn("border-b border-line-200", profundidade > 0 && "bg-canvas-100/40")}>
                <th
                  scope="row"
                  className="py-1.5 pr-3 text-left font-normal"
                  style={{ paddingLeft: `${14 + profundidade * 28}px` }}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {no.filhos.length > 0 ? (
                      <button
                        type="button"
                        aria-expanded={aberto}
                        aria-label={`${aberto ? "Fechar" : "Abrir"} ${no.rotulo}`}
                        onClick={() => alternar(no.chave)}
                        className={cn(BOTAO_PEQUENO, "h-8 w-8 justify-center text-slate-600 hover:bg-canvas-100")}
                      >
                        <svg
                          aria-hidden="true"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={cn("transition-transform", aberto && "rotate-90")}
                        >
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    ) : (
                      <span aria-hidden="true" className="w-8 flex-none" />
                    )}
                    <span className="flex min-w-0 max-w-[340px] flex-col">
                      <span className="text-12 text-slate-600">{no.tipo}</span>
                      <span title={no.rotulo} className={cn("truncate", profundidade === 0 && "font-semibold")}>
                        {no.rotulo}
                      </span>
                    </span>
                    {no.linha.nivel === "anuncio" && (
                      <button
                        type="button"
                        aria-label={`Ver quem veio por ${no.rotulo}`}
                        onClick={() => onVerQuem(no.linha)}
                        className={cn(
                          BOTAO_PEQUENO,
                          "ml-auto min-h-8 border border-line-200 bg-paper-0 px-2.5 text-volt-950 hover:bg-canvas-100",
                        )}
                      >
                        Ver quem
                      </button>
                    )}
                  </div>
                </th>
                <td className="px-3 py-1.5">
                  <MiniFunilA contas={no.linha} />
                </td>
                <td className={NUMERO}>{col.gasto}</td>
                <td className={NUMERO}>{col.cadastros}</td>
                <td className={NUMERO}>{col.compraram}</td>
                <td className={cn(NUMERO, "font-medium text-success-700")}>{col.vendido}</td>
                <td className={cn(NUMERO, "pr-5 font-medium")}>{col.retorno}</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <th scope="row" className="py-3.5 pl-5 pr-3 text-left">
              Total dos anúncios
            </th>
            <td className="px-3 py-1.5">
              <MiniFunilA contas={total} />
            </td>
            <td className={NUMERO}>{doTotal.gasto}</td>
            <td className={NUMERO}>{doTotal.cadastros}</td>
            <td className={NUMERO}>{doTotal.compraram}</td>
            <td className={cn(NUMERO, "text-success-700")}>{doTotal.vendido}</td>
            <td className={cn(NUMERO, "pr-5")}>{doTotal.retorno}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
