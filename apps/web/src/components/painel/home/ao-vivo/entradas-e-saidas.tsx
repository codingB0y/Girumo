"use client";

import { useMemo, useState } from "react";
import { GraficoDeBarras } from "@/components/painel/campanhas/detalhe/grafico-barras";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { dayBR, horaBR } from "@/lib/date-br";
import {
  barrasDaAtividade,
  diaPorExtenso,
  marcasDeGrupoAberto,
  marcasDePost,
  marcasDeRelampago,
  nomeDoMes,
  somaMedida,
  type AtividadeDaCampanha,
  type Periodo,
} from "@/lib/painel/atividade";
import { fraseDoMovimento, medindoDesde, unidadeDeEntradas, unidadeDeSaidas } from "@/lib/painel/atividade-texto";
import type { OfferRow } from "@/lib/stores/flash-offers";
import { cn } from "@/lib/utils";

type Props = { atividade: AtividadeDaCampanha | null; posts: TenantDispatchView[]; ofertasDoDia: OfferRow[] };

/**
 * Entradas e saídas da loja inteira, hoje por hora, 7 dias ou o mês, com os posts
 * e os grupos abertos do dia marcados (spec 2026-10-02, PR 3).
 */
export function EntradasESaidas({ atividade, posts, ofertasDoDia }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const hoje = atividade ? dayBR(new Date(atividade.geradoEm)) : "";

  return (
    <section data-testid="inicio-entradas" aria-labelledby="entradas-titulo" className="rounded-[10px] border border-line-200 bg-paper-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-200 px-5 py-3">
        <h2 id="entradas-titulo" className="text-[16px] font-semibold text-volt-950">
          Entradas e saídas
        </h2>
        <div role="group" aria-label="Período" className="flex rounded-lg bg-canvas-100 p-0.5 max-md:hidden">
          {(
            [
              ["hoje", "Hoje, por hora"],
              ["7d", "7 dias"],
              ["mes", hoje ? nomeDoMes(hoje) : "Mês"],
            ] as const
          ).map(([p, rotulo]) => (
            <button
              key={p}
              type="button"
              aria-pressed={periodo === p}
              onClick={() => setPeriodo(p)}
              className={cn(
                "h-8 rounded-md px-3 text-13 font-medium transition-colors",
                periodo === p ? "bg-paper-0 text-volt-950" : "text-slate-600 hover:text-volt-950",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
        {atividade && (
          <p className="text-12 text-slate-600 sm:ml-auto">
            {diaPorExtenso(hoje)} · dados até {horaBR(atividade.geradoEm)}
          </p>
        )}
      </div>

      {atividade ? (
        <Grafico atividade={atividade} periodo={periodo} posts={posts} ofertasDoDia={ofertasDoDia} />
      ) : (
        // A faixa já diz o mesmo; a recarga de 60 s tenta de novo sozinha.
        <p className="px-5 py-8 text-center text-13 text-slate-600">A série não carregou.</p>
      )}
    </section>
  );
}

function Grafico({ atividade: a, periodo, posts, ofertasDoDia }: { atividade: AtividadeDaCampanha; periodo: Periodo; posts: TenantDispatchView[]; ofertasDoDia: OfferRow[] }) {
  const hoje = dayBR(new Date(a.geradoEm));
  const entradas = useMemo(() => barrasDaAtividade(a, periodo, "entraram", "sairam"), [a, periodo]);
  // Hoje por hora: o que pode explicar um pico, os posts, as relâmpagos e os grupos abertos sozinhos.
  const marcas = useMemo(
    () =>
      periodo === "hoje"
        ? [...marcasDePost(posts, new Date(a.geradoEm)), ...marcasDeRelampago(ofertasDoDia, new Date(a.geradoEm)), ...marcasDeGrupoAberto(a.gruposAbertosHoje, { comNome: true })].sort(
            (x, y) => x.posicao - y.posicao,
          )
        : [],
    [periodo, posts, ofertasDoDia, a.geradoEm, a.gruposAbertosHoje],
  );

  const quando = periodo === "hoje" ? "hoje" : periodo === "7d" ? "nos últimos 7 dias" : `em ${nomeDoMes(hoje).toLowerCase()}`;
  const [hh, mm] = horaBR(a.geradoEm).split(":").map(Number);
  const desde = medindoDesde(a.entradasDesde);
  const algoSemMedicao = entradas.some((b) => b.semMedicao);
  const frase = fraseDoMovimento(entradas, somaMedida(entradas), quando, algoSemMedicao ? desde : null, "nos grupos da loja");

  return (
    <figure className="m-0 min-w-0 px-5 pb-4 pt-5">
      <figcaption className="mb-4">
        <p className="text-sm font-semibold text-volt-950">Entradas e saídas {quando}</p>
        <p className="mt-0.5 text-13 text-slate-600">{frase}</p>
      </figcaption>
      <GraficoDeBarras
        key={periodo}
        barras={entradas}
        resumo={`Entradas e saídas ${quando}: ${frase}`}
        unidade={unidadeDeEntradas}
        unidadeAbaixo={unidadeDeSaidas}
        rotuloACada={periodo === "hoje" ? 3 : 1}
        agora={periodo === "hoje" ? (hh * 60 + mm) / 1440 : undefined}
        marcas={marcas}
        rotuloSemMedicao={desde}
      />
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-slate-600">
        <Legenda cor="bg-serie">Entraram</Legenda>
        <Legenda cor="bg-saida">Saíram</Legenda>
        <span>cada entrada e saída nos grupos da loja em que você é admin</span>
      </p>
    </figure>
  );
}

function Legenda({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-[2px]", cor)} aria-hidden="true" />
      {children}
    </span>
  );
}
