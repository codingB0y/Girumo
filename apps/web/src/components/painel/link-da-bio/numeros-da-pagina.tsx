// apps/web/src/components/painel/link-da-bio/numeros-da-pagina.tsx
"use client";

import React, { useEffect, useState } from "react";

import { ErroDeCarga } from "@/components/painel/erro-de-carga";
import type { LinkBio } from "@/lib/bio/documento";
import { ehRelatorioBio, resumoDoRelatorio, type ResumoDoRelatorio } from "@/lib/bio/editor-divulgar";
import type { Carga } from "@/lib/painel/types";
import type { RelatorioBio } from "@/lib/stores/bio-pages";
import { authenticatedFetch } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type PeriodoDosNumeros = 7 | 30;

const PERIODOS: readonly PeriodoDosNumeros[] = [7, 30];
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

/** Os números de um período (§7), já resumidos. Só desenha. */
export function QuadroDosNumeros({ resumo }: { resumo: ResumoDoRelatorio }) {
  if (resumo.vazio) {
    return (
      <p className="text-15 text-slate-600">Nenhuma visita nesses dias. Quando o endereço estiver na bio, os números aparecem aqui.</p>
    );
  }
  const numeros: readonly (readonly [string, string])[] = [
    ["Visitas", resumo.visitas],
    ["Toques", resumo.toques],
    ["Toques por visita", resumo.porVisita],
  ];
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="grid content-start gap-0.5 rounded-lg bg-canvas-100 p-3">
            <dt className="text-13 text-slate-600">{rotulo}</dt>
            <dd className="min-w-0 break-words font-data text-28 font-bold leading-tight text-volt-950">{valor}</dd>
          </div>
        ))}
      </dl>
      {resumo.linhas.length > 0 && (
        <table className="w-full text-15">
          <caption className="sr-only">Toques em cada botão</caption>
          <thead>
            <tr className="border-b border-line-200 text-left text-13 text-slate-600">
              <th scope="col" className="py-2 font-semibold">
                Botão
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Toques
              </th>
            </tr>
          </thead>
          <tbody>
            {resumo.linhas.map((l) => (
              <tr key={l.chave} className="border-b border-line-200 last:border-b-0">
                <td className="py-2 pr-3 text-volt-950">{l.titulo}</td>
                <td className="py-2 text-right font-data text-volt-950">{l.toques}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-13 text-slate-600">Toques por visita passa de 1 quando a mesma pessoa toca em mais de um botão.</p>
    </div>
  );
}

/** "Últimos 7/30 dias" da aba Divulgar: busca `GET /api/link-da-bio/relatorio?dias=` e mostra o resumo. */
export function NumerosDaPagina({ links }: { links: readonly LinkBio[] }) {
  const [dias, setDias] = useState<PeriodoDosNumeros>(7);
  const [tentativa, setTentativa] = useState(0);
  const [carga, setCarga] = useState<Carga>("carregando");
  const [relatorio, setRelatorio] = useState<RelatorioBio | null>(null);

  useEffect(() => {
    // Trocar de período rápido dispara duas buscas: só a última escreve.
    let valendo = true;
    setCarga("carregando");
    void (async () => {
      try {
        const r = await authenticatedFetch(`/api/link-da-bio/relatorio?dias=${dias}`, { cache: "no-store" });
        const corpo: unknown = r.ok ? await r.json() : null;
        if (!valendo) return;
        if (ehRelatorioBio(corpo)) {
          setRelatorio(corpo);
          setCarga("ok");
        } else {
          setCarga("erro");
        }
      } catch {
        if (valendo) setCarga("erro");
      }
    })();
    return () => {
      valendo = false;
    };
  }, [dias, tentativa]);

  return (
    <section aria-labelledby="bio-numeros-titulo" className="pn-card grid gap-4 rounded-xl p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="bio-numeros-titulo" className="font-brand text-15 font-bold text-volt-950">
          {`Últimos ${dias} dias`}
        </h2>
        <div role="group" aria-label="Período" className="flex gap-1 rounded-lg bg-canvas-100 p-1">
          {PERIODOS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={dias === n}
              onClick={() => setDias(n)}
              className={cn(
                "min-h-11 rounded-md px-3 text-13 font-semibold",
                FOCO,
                dias === n ? "bg-paper-0 text-volt-950" : "text-slate-600 hover:text-volt-950",
              )}
            >
              {`${n} dias`}
            </button>
          ))}
        </div>
      </div>
      {carga === "carregando" && (
        <div role="status" className="grid gap-2">
          <span className="sr-only">Carregando os números…</span>
          <div aria-hidden="true" className="pn-skeleton h-20 rounded-lg" />
        </div>
      )}
      {carga === "erro" && (
        <ErroDeCarga titulo="Não deu para carregar os números." aoTentarDeNovo={() => setTentativa((n) => n + 1)} />
      )}
      {carga === "ok" && relatorio && <QuadroDosNumeros resumo={resumoDoRelatorio(relatorio, links)} />}
    </section>
  );
}
