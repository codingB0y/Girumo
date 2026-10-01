"use client";

import { useEffect, useMemo, useState } from "react";
import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import { dayBR, diaMesBR, horaBR } from "@/lib/date-br";
import {
  barrasDaAtividade,
  diaDaSemanaPassada,
  diaPorExtenso,
  marcasDePost,
  nomeDoMes,
  somaMedida,
  variacao,
  type AtividadeDaCampanha,
  type Barra,
  type Periodo,
} from "@/lib/painel/atividade";
import { numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";
import { GraficoDeBarras, saldo } from "./grafico-barras";

/**
 * A série da campanha, de `GET /api/campanhas/[slug]/atividade`. Busca de novo
 * quando a página atualiza (`versao` muda) ou quando a pessoa pede.
 */
export function useAtividade(slug: string, versao: number) {
  const [atividade, setAtividade] = useState<AtividadeDaCampanha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/campanhas/${encodeURIComponent(slug)}/atividade`)
      .then(async (r) => {
        const corpo: unknown = await r.json().catch(() => null);
        if (!r.ok) {
          const msg = corpo && typeof corpo === "object" && "error" in corpo ? String(corpo.error) : "";
          throw new Error(msg || "Não deu para ler a análise da campanha.");
        }
        return corpo as AtividadeDaCampanha;
      })
      .then((a) => {
        if (!vivo) return;
        setAtividade(a);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        // Sem série nova, a faixa de números não pode seguir mostrando a leitura
        // anterior ao lado de um "atualizado" que já é o de agora.
        setAtividade(null);
        setErro(e instanceof Error ? e.message : "Não deu para ler a análise da campanha.");
      });
    return () => {
      vivo = false;
    };
  }, [slug, versao, tentativa]);

  return { atividade, erro, tentarDeNovo: () => setTentativa((t) => t + 1) };
}

type Props = {
  atividade: AtividadeDaCampanha | null;
  erro: string | null;
  aoTentarDeNovo: () => void;
  /** Os posts da campanha: os de hoje viram marcas no gráfico por hora. */
  posts: DispatchView[] | null;
};

const unidadeDeEntradas: [string, string] = ["entrou", "entraram"];
const unidadeDeSaidas: [string, string] = ["saiu", "saíram"];
const unidadeDeCliques: [string, string] = ["clique", "cliques"];

/** "medindo desde 29/09" ou, quando a medição começou no meio do dia, "medindo desde 29/09, 16h". */
export function medindoDesde(iso: string): string {
  const hora = horaBR(iso);
  return hora === "00:00" ? `medindo desde ${diaMesBR(iso)}` : `medindo desde ${diaMesBR(iso)}, ${hora.slice(0, 2)}h`;
}

/**
 * Seção Análise da direção D (spec 2026-09-24, PRs C e D): quem entrou e saiu dos
 * grupos e os cliques no link, hoje por hora, nos 7 dias ou no mês, com os posts
 * do dia marcados.
 */
export function AnaliseDaCampanha({ atividade, erro, aoTentarDeNovo, posts }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const agora = atividade ? new Date(atividade.geradoEm) : null;
  const hoje = agora ? dayBR(agora) : "";

  return (
    <section aria-labelledby="analise-titulo" className="rounded-[10px] border border-line-200 bg-paper-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-200 px-5 py-3">
        <h2 id="analise-titulo" className="text-16 font-semibold text-volt-950">
          Análise
        </h2>
        <div role="group" aria-label="Período" className="flex rounded-lg bg-canvas-100 p-0.5">
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

      {erro ? (
        <p className="px-5 py-8 text-center text-13 text-slate-600">
          {erro}{" "}
          <button type="button" onClick={aoTentarDeNovo} className="font-medium text-cobalt-500 hover:underline">
            Tentar de novo
          </button>
        </p>
      ) : !atividade ? (
        <div role="status" aria-label="Carregando a análise" className="p-5">
          <div className="pn-skeleton h-56 rounded-lg" />
        </div>
      ) : (
        <Graficos atividade={atividade} periodo={periodo} posts={posts} />
      )}
    </section>
  );
}

function Graficos({ atividade: a, periodo, posts }: { atividade: AtividadeDaCampanha; periodo: Periodo; posts: DispatchView[] | null }) {
  const hoje = dayBR(new Date(a.geradoEm));
  const entradas = useMemo(() => barrasDaAtividade(a, periodo, "entraram", "sairam"), [a, periodo]);
  const cliques = useMemo(() => barrasDaAtividade(a, periodo, "cliques"), [a, periodo]);
  const marcas = useMemo(
    () => (periodo === "hoje" && posts ? marcasDePost(posts, new Date(a.geradoEm)) : []),
    [periodo, posts, a.geradoEm],
  );

  const quando = periodo === "hoje" ? "hoje" : periodo === "7d" ? "nos últimos 7 dias" : `em ${nomeDoMes(hoje).toLowerCase()}`;
  const [hh, mm] = horaBR(a.geradoEm).split(":").map(Number);
  const desde = medindoDesde(a.entradasDesde);
  const algoSemMedicao = entradas.some((b) => b.semMedicao);
  const movimento = somaMedida(entradas);
  const totalCliques = soma(cliques);
  // A conversão só compara o que foi medido dos dois lados: clique de antes da
  // medição não tem entrada gravada para virar.
  const cliquesMedidos = cliques.reduce((s, b, i) => (entradas[i] && !entradas[i].semMedicao && !b.futuro ? s + b.valor : s), 0);
  const fraseDeEntradas = fraseDoMovimento(entradas, movimento, quando, algoSemMedicao ? desde : null);

  return (
    <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <figure className="m-0 min-w-0 px-5 pb-4 pt-5">
        <figcaption className="mb-4">
          <p className="text-sm font-semibold text-volt-950">Entradas e saídas {quando}</p>
          <p className="mt-0.5 text-13 text-slate-600">{fraseDeEntradas}</p>
        </figcaption>
        <GraficoDeBarras
          key={periodo}
          barras={entradas}
          resumo={`Entradas e saídas ${quando}: ${fraseDeEntradas}`}
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
          <span>cada entrada e saída nos grupos da campanha, como o WhatsApp avisa</span>
        </p>
      </figure>

      <figure className="m-0 min-w-0 border-t border-line-200 px-5 pb-4 pt-5 lg:border-l lg:border-t-0">
        <figcaption className="mb-4">
          <p className="text-sm font-semibold text-volt-950">Cliques no link {periodo === "hoje" ? "por hora" : "por dia"}</p>
          <p className="mt-0.5 text-13 text-slate-600">
            {numero(totalCliques)} {quando}
            {periodo === "hoje" && <Comparacao hoje={totalCliques} antes={a.semanaPassada.cliques} dia={diaDaSemanaPassada(hoje)} />}
          </p>
        </figcaption>
        {totalCliques === 0 ? (
          <div className="rounded-lg border border-dashed border-line-200 px-4 py-6 text-13 text-slate-600">
            <p className="font-medium text-volt-950">Ninguém clicou no link {quando}.</p>
            <p className="mt-1">
              É o link da campanha que leva cada pessoa pro grupo com vaga. Use ele nos posts, no Instagram e no status do WhatsApp.
            </p>
          </div>
        ) : (
          <>
            <GraficoDeBarras
              key={periodo}
              barras={cliques}
              resumo={`Cliques no link ${quando}: ${frase(cliques, totalCliques, quando, unidadeDeCliques, "")}`}
              unidade={unidadeDeCliques}
              rotuloACada={periodo === "hoje" ? 6 : periodo === "7d" ? 2 : 1}
              agora={periodo === "hoje" ? (hh * 60 + mm) / 1440 : undefined}
              baixo
            />
            {cliquesMedidos > 0 && (
              <p className="mt-3 text-13 text-slate-600">
                {conversao(movimento.entraram, cliquesMedidos)}
                {algoSemMedicao ? ` (${desde})` : ""}
              </p>
            )}
          </>
        )}
      </figure>
    </div>
  );
}

function soma(barras: Barra[]): number {
  return barras.reduce((s, b) => s + b.valor, 0);
}

/** "1 clique", "12 cliques". */
function contagem(n: number, [um, varios]: [string, string]): string {
  return `${numero(n)} ${n === 1 ? um : varios}`;
}

function frase(barras: Barra[], total: number, quando: string, unidade: [string, string], vazio: string): string {
  if (total === 0) return vazio;
  const pico = barras.reduce((m, b) => (b.valor > m.valor ? b : m), barras[0]);
  return `${contagem(total, unidade)} ${quando}; o pico foi ${pico.rotuloLongo}, com ${numero(pico.valor)}.`;
}

/**
 * "12 entraram e 3 saíram hoje; saldo +9. O pico foi 12h às 12h59, com 5." Com
 * parte do período antes da medição, diz desde quando conta.
 */
function fraseDoMovimento(barras: Barra[], m: { entraram: number; sairam: number }, quando: string, desde: string | null): string {
  if (barras.every((b) => b.semMedicao)) return `Entradas e saídas ainda não eram medidas neste período (${desde}).`;
  const nota = desde ? ` (${desde})` : "";
  if (m.entraram + m.sairam === 0) return `Ninguém entrou nem saiu ${quando}${nota}.`;
  const pico = barras.reduce((p, b) => (!b.semMedicao && b.valor > p.valor ? b : p), barras.find((b) => !b.semMedicao) ?? barras[0]);
  const base = `${contagem(m.entraram, unidadeDeEntradas)} e ${contagem(m.sairam, unidadeDeSaidas)} ${quando}${nota}; saldo ${saldo(m.entraram - m.sairam)}.`;
  return pico.valor > 0 ? `${base} O pico foi ${pico.rotuloLongo}, com ${numero(pico.valor)}.` : base;
}

/** Cliques que viraram entrada; quando entra mais gente do que clicou, diz isso em vez de mostrar 100%. */
function conversao(entraram: number, cliques: number): string {
  if (entraram > cliques) {
    return `${numero(entraram)} ${entraram === 1 ? "entrada" : "entradas"} para ${contagem(cliques, unidadeDeCliques)}: tem gente entrando sem passar pelo link.`;
  }
  return `${Math.round((entraram / cliques) * 100)}% viraram entrada: ${numero(entraram)} de ${contagem(cliques, unidadeDeCliques)}.`;
}

function Legenda({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-[2px]", cor)} aria-hidden="true" />
      {children}
    </span>
  );
}

function Comparacao({ hoje, antes, dia }: { hoje: number; antes: number; dia: string }) {
  const delta = variacao(hoje, antes);
  if (delta === null) return null;
  return (
    <>
      {" · "}
      <span className={cn("font-semibold", delta >= 0 ? "text-success-700" : "text-danger-700")}>
        {delta > 0 ? "+" : ""}
        {delta}%
      </span>{" "}
      vs {dia}, mesma hora
    </>
  );
}
