"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { CampaignGroupsOverview } from "@/lib/campaign-groups-overview";
import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import { dayBR, dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import { GROUP_FULL_RATIO } from "@/lib/links/resolve-click-target";
import { abreviaNome } from "@/lib/painel/casca";
import {
  estadoNaCampanha,
  faixaDeLotacao,
  filtrarGrupos,
  hojeNaCampanha,
  novasHojePorGrupo,
  novasHojeVsSemanaPassada,
  novasPorDia,
  novasPorHoraHoje,
  ordenarGrupos,
  ultimasEntradas,
  variacao,
  type Barra,
  type EstadoDoPost,
  type EstadoNaCampanha,
  type FiltroDeGrupos,
  type ItemDoDia,
  type LeadResumo,
} from "@/lib/painel/campanha-visao";
import { lotacao, numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";
import { GraficoDeBarras } from "./grafico-barras";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const LINHAS = 8;

type Props = {
  groupIds: string[];
  overview: CampaignGroupsOverview;
  /** Entradas por clique (%), null sem clique. */
  taxaEntrada: number | null;
  receita: number;
  pedidos: number;
  leads: LeadResumo[];
  /** null enquanto os posts carregam. */
  posts: DispatchView[] | null;
  /** Quando os dados foram lidos: "hoje" e "agora" saem daqui. */
  agora: Date;
  aoVerGrupos: () => void;
  aoVerPosts: () => void;
};

/**
 * Visão geral da campanha, direção D (spec 2026-09-24, PR B): faixa de
 * números num painel só, novas pessoas por hora e por dia, a tabela dos grupos
 * e o dia da campanha. Só dado que já existe; cliques por hora e saídas entram
 * nos PRs C e D.
 */
export function VisaoGeralCampanha({ groupIds, overview: o, taxaEntrada, receita, pedidos, leads, posts, agora, aoVerGrupos, aoVerPosts }: Props) {
  const [periodo, setPeriodo] = useState<"hoje" | "7d">("hoje");
  const [filtro, setFiltro] = useState<FiltroDeGrupos>("todos");

  const faixa = useMemo(() => faixaDeLotacao(o.groups), [o.groups]);
  const comp = useMemo(() => novasHojeVsSemanaPassada(leads, groupIds, agora), [leads, groupIds, agora]);
  const porDia = useMemo(() => novasPorDia(leads, groupIds, 7, agora), [leads, groupIds, agora]);
  const porHora = useMemo(() => novasPorHoraHoje(leads, groupIds, agora), [leads, groupIds, agora]);
  const hojePorGrupo = useMemo(() => novasHojePorGrupo(leads, groupIds, agora), [leads, groupIds, agora]);
  const grupos = useMemo(() => filtrarGrupos(ordenarGrupos(o.groups), filtro), [o.groups, filtro]);
  const dia = useMemo(() => (posts ? hojeNaCampanha(posts, agora) : null), [posts, agora]);
  const entradas = useMemo(() => ultimasEntradas(leads, groupIds, 5), [leads, groupIds]);

  const delta = variacao(comp.hoje, comp.antes);
  const barras = periodo === "hoje" ? porHora : porDia;
  const total = barras.reduce((s, b) => s + b.valor, 0);
  const pico = barras.reduce((m, b) => (b.valor > m.valor ? b : m), barras[0]);
  const resumo =
    total === 0
      ? periodo === "hoje" ? "Ninguém novo entrou hoje ainda." : "Ninguém novo entrou nos últimos 7 dias."
      : `${numero(total)} ${total === 1 ? "pessoa nova" : "pessoas novas"} ${periodo === "hoje" ? "hoje" : "em 7 dias"}; o pico foi ${pico.rotuloLongo}, com ${pico.valor}.`;
  const filtros: [FiltroDeGrupos, string, number][] = [
    ["todos", "Todos", o.groups.length],
    ["lotados", "Lotados", faixa.lotados],
    ["quase", "Quase", faixa.quase],
    ["com_vaga", "Com vaga", faixa.comVaga],
  ];

  return (
    <div className="space-y-6">
      {/* Faixa de números: um painel só, fio entre as células (gap-px sobre o fundo do fio). */}
      <section aria-label="Números da campanha" className="grid gap-px overflow-hidden rounded-[10px] border border-line-200 bg-line-200 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1.15fr_1fr]">
        <div className="bg-paper-0 px-5 py-4 sm:col-span-2 lg:col-span-1">
          <p className="text-13 text-slate-600">Novas pessoas hoje</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <p className="text-[44px] font-semibold leading-none tabular-nums text-volt-950 [font-stretch:75%]">{numero(comp.hoje)}</p>
            <Faisca barras={porDia} />
          </div>
          <p className="mt-2 text-13 text-slate-600">
            {delta === null ? (
              `${numero(comp.antes)} na ${comp.diaDaSemana} passada, mesma hora`
            ) : (
              <>
                <span className={cn("inline-flex items-center font-semibold", delta >= 0 ? "text-success-700" : "text-danger-700")}>
                  {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
                  {delta > 0 ? "+" : ""}
                  {delta}%
                </span>{" "}
                vs {numero(comp.antes)} na {comp.diaDaSemana} passada, mesma hora
              </>
            )}
          </p>
        </div>
        <Celula rotulo="Cliques no link" valor={numero(o.clicks)}>
          {taxaEntrada === null ? "nenhum clique ainda" : `no total · ${taxaEntrada}% viraram entrada`}
        </Celula>
        <Celula rotulo="Pessoas nos grupos" valor={numero(o.totalMembers)}>
          <span className="pn-lotacao mb-1.5 block" aria-hidden="true">
            <span className="pn-lotacao__cheio" style={{ width: `${Math.min(100, o.fillPct)}%` }} />
          </span>
          {o.fillPct}% das {numero(o.totalCapacity)} vagas
        </Celula>
        <Celula rotulo="Grupos" valor={numero(o.groupCount)}>
          <FaixaDeGrupos lotados={faixa.lotados} quase={faixa.quase} comVaga={faixa.comVaga} total={o.groups.length} />
          <span className="inline-flex flex-wrap gap-x-2.5">
            <Legenda cor="bg-acid-500">{faixa.lotados} lotados</Legenda>
            <Legenda cor="bg-quase">{faixa.quase} quase</Legenda>
            <Legenda cor="bg-slate-600">{faixa.comVaga} com vaga</Legenda>
          </span>
        </Celula>
        <Celula rotulo="Vendas anotadas" valor={brl.format(receita)}>
          {pedidos === 0 ? "nenhum pedido desta campanha" : `${numero(pedidos)} ${pedidos === 1 ? "pedido" : "pedidos"}`}
        </Celula>
      </section>

      <section aria-labelledby="analise-titulo" className="rounded-[10px] border border-line-200 bg-paper-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-200 px-5 py-3">
          <h2 id="analise-titulo" className="text-16 font-semibold text-volt-950">
            Novas pessoas nos grupos
          </h2>
          <div role="group" aria-label="Período" className="flex rounded-lg bg-canvas-100 p-0.5">
            {(
              [
                ["hoje", "Hoje, por hora"],
                ["7d", "7 dias"],
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
          <p className="text-12 text-slate-600 sm:ml-auto">quem entrou pela 1ª vez · dados até {horaBR(agora.toISOString())}</p>
        </div>
        <div className="px-5 pb-4 pt-6">
          <GraficoDeBarras barras={barras} resumo={resumo} rotuloACada={periodo === "hoje" ? 3 : 1} />
          <p className="mt-3 text-13 text-slate-600">{resumo}</p>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="grupos-titulo" className="min-w-0 rounded-[10px] border border-line-200 bg-paper-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-200 px-5 py-3">
            <h2 id="grupos-titulo" className="text-16 font-semibold text-volt-950">
              Grupos da campanha
            </h2>
            <p className="text-13 text-slate-600">o link manda cada pessoa pro grupo com vaga</p>
            <div role="group" aria-label="Filtrar grupos" className="flex w-full gap-1 overflow-x-auto sm:ml-auto sm:w-auto">
              {filtros.map(([f, rotulo, n]) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filtro === f}
                  onClick={() => setFiltro(f)}
                  className={cn(
                    "h-8 shrink-0 rounded-md border px-2.5 text-13 transition-colors",
                    filtro === f ? "border-slate-600 bg-hover-ficha text-volt-950" : "border-line-200 text-slate-600 hover:text-volt-950",
                  )}
                >
                  {rotulo} <span className="tabular-nums">{n}</span>
                </button>
              ))}
            </div>
          </div>

          {grupos.length === 0 ? (
            <p className="px-5 py-8 text-center text-13 text-slate-600">Nenhum grupo neste filtro.</p>
          ) : (
            <>
              <table className="hidden w-full text-13 sm:table">
                <thead>
                  <tr className="border-b border-line-200 text-left text-12 text-slate-600">
                    <th scope="col" className="px-5 py-2.5 font-medium">Grupo</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Pessoas</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Lotação</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Novas hoje</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.slice(0, LINHAS).map((g) => {
                    const fracao = lotacao(g.members, g.capacity);
                    const novas = hojePorGrupo.get(g.id) ?? 0;
                    return (
                      <tr key={g.id} className="border-b border-line-200 last:border-0 hover:bg-hover-ficha">
                        <td className="max-w-[280px] truncate px-5 py-2.5 font-medium text-volt-950">{g.group?.name ?? "Grupo sem registro"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-volt-950">{numero(g.members)}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <Lotacao fracao={fracao} className="w-24" />
                            <span className="w-9 text-right tabular-nums text-slate-600">{Math.round(fracao * 100)}%</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-volt-950">{novas > 0 ? `+${numero(novas)}` : "—"}</td>
                        <td className="px-5 py-2.5">
                          <SeloDoGrupo estado={estadoNaCampanha(g)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <ul className="sm:hidden">
                {grupos.slice(0, LINHAS).map((g) => {
                  const fracao = lotacao(g.members, g.capacity);
                  const novas = hojePorGrupo.get(g.id) ?? 0;
                  return (
                    <li key={g.id} className="flex items-center gap-3 border-b border-line-200 px-4 py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-volt-950">{g.group?.name ?? "Grupo sem registro"}</p>
                        <p className="mt-1.5 flex items-center gap-2 text-12 text-slate-600">
                          <Lotacao fracao={fracao} className="w-14 shrink-0" />
                          <span className="tabular-nums">
                            {numero(g.members)} de {numero(g.capacity)}
                            {novas > 0 ? ` · +${numero(novas)} hoje` : ""}
                          </span>
                        </p>
                      </div>
                      <SeloDoGrupo estado={estadoNaCampanha(g)} />
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div className="flex items-center justify-between border-t border-line-200 px-5 py-3 text-13 text-slate-600">
            <span className="tabular-nums">
              {Math.min(grupos.length, LINHAS)} de {grupos.length}
            </span>
            <button type="button" onClick={aoVerGrupos} className="font-medium text-cobalt-500 hover:underline">
              Ver todos e configurar →
            </button>
          </div>
        </section>

        {/* No celular o dia vem antes da tabela: é o que muda de hora em hora. */}
        <div className="order-first space-y-6 lg:order-none">
          <section aria-labelledby="dia-titulo">
            <div className="flex items-baseline justify-between border-b border-line-200 pb-2.5">
              <h2 id="dia-titulo" className="text-16 font-semibold text-volt-950">
                Hoje na campanha
              </h2>
              <button type="button" onClick={aoVerPosts} className="text-13 font-medium text-cobalt-500 hover:underline">
                Ver posts
              </button>
            </div>
            {dia === null ? (
              <div role="status" aria-label="Carregando os posts" className="mt-3">
                <div className="pn-skeleton h-14 rounded-lg" data-testid="painel-skeleton" />
              </div>
            ) : dia.length === 0 ? (
              <p className="py-4 text-13 text-slate-600">
                Nenhum post hoje nem agendado.{" "}
                <button type="button" onClick={aoVerPosts} className="font-medium text-cobalt-500 hover:underline">
                  Postar agora
                </button>
              </p>
            ) : (
              <ol>
                {dia.map((item) => (
                  <ItemDoDiaLinha key={item.id} item={item} />
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="entradas-titulo">
            <div className="flex items-baseline justify-between border-b border-line-200 pb-2.5">
              <h2 id="entradas-titulo" className="text-16 font-semibold text-volt-950">
                Últimas entradas
              </h2>
              <span className="text-13 tabular-nums text-slate-600">{numero(comp.hoje)} hoje</span>
            </div>
            {entradas.length === 0 ? (
              <p className="py-4 text-13 text-slate-600">Ninguém entrou pelos grupos desta campanha ainda.</p>
            ) : (
              <ul>
                {entradas.map((l) => (
                  <li key={l.id ?? `${l.sourceGroupId}-${l.enteredAt}`} className="flex items-baseline gap-2 border-b border-line-200 py-2.5 text-13 last:border-0">
                    <span className="min-w-0 flex-1 truncate">
                      <strong className="font-semibold text-volt-950">{abreviaNome(l.name)}</strong>{" "}
                      <span className="text-slate-600">veio pelo {l.sourceGroup || "grupo"}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {dayBROf(l.enteredAt) === dayBR(agora) ? horaBR(l.enteredAt) : diaMesBR(l.enteredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Celula({ rotulo, valor, children }: { rotulo: string; valor: string; children: React.ReactNode }) {
  return (
    <div className="bg-paper-0 px-5 py-4">
      <p className="text-13 text-slate-600">{rotulo}</p>
      <p className="mt-2 text-[30px] font-semibold leading-none tabular-nums text-volt-950 [font-stretch:75%]">{valor}</p>
      <div className="mt-2.5 text-13 text-slate-600">{children}</div>
    </div>
  );
}

/** Os últimos 7 dias em miniatura; o de hoje aceso. */
function Faisca({ barras }: { barras: Barra[] }) {
  const max = Math.max(1, ...barras.map((b) => b.valor));
  return (
    <span className="flex shrink-0 flex-col items-end gap-1" aria-hidden="true">
      <span className="flex h-8 items-end gap-[3px]">
        {barras.map((b) => (
          <span
            key={b.chave}
            className={cn("block w-[5px] rounded-t-[1px]", b.atual ? "bg-serie" : "bg-slate-600/50")}
            style={{ height: `${Math.max(8, (b.valor / max) * 100)}%` }}
          />
        ))}
      </span>
      <span className="text-12 text-slate-600">7 dias</span>
    </span>
  );
}

function FaixaDeGrupos({ lotados, quase, comVaga, total }: { lotados: number; quase: number; comVaga: number; total: number }) {
  const w = (n: number) => `${total > 0 ? (n / total) * 100 : 0}%`;
  return (
    <span className="mb-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-line-200" aria-hidden="true">
      <span className="bg-acid-500" style={{ width: w(lotados) }} />
      <span className="bg-quase" style={{ width: w(quase) }} />
      <span className="bg-slate-600" style={{ width: w(comVaga) }} />
    </span>
  );
}

function Legenda({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <span className={cn("h-2 w-2 rounded-[2px]", cor)} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A barra do painel; a ponta acende em Acid quando o grupo lota (≥ 95%). */
function Lotacao({ fracao, className }: { fracao: number; className?: string }) {
  return (
    <span className={cn("pn-lotacao block", className)} aria-hidden="true">
      <span className={cn("pn-lotacao__cheio", fracao >= GROUP_FULL_RATIO && "pn-lotacao__cheio--ponta")} style={{ width: `${Math.round(fracao * 100)}%` }} />
    </span>
  );
}

const SELO: Record<EstadoNaCampanha, { texto: string; classe: string }> = {
  cheio: { texto: "Lotou", classe: "pn-chip--acid" },
  quase: { texto: "Quase", classe: "bg-aviso-fundo text-warning-700" },
  ativo: { texto: "Com vaga", classe: "" },
  sem_convite: { texto: "Sem convite", classe: "pn-chip--risco" },
  sumiu: { texto: "Sumiu", classe: "pn-chip--line" },
};

function SeloDoGrupo({ estado }: { estado: EstadoNaCampanha }) {
  const selo = SELO[estado];
  return <span className={cn("pn-chip shrink-0", selo.classe)}>{selo.texto}</span>;
}

const ROTULO_DO_ESTADO: Record<EstadoDoPost, string> = {
  postando: "Postando",
  na_fila: "Na fila",
  postado: "Postado",
  falhou: "Falhou",
  agendado: "Agendado",
};

function ItemDoDiaLinha({ item }: { item: ItemDoDia }) {
  const emCurso = item.estado === "postando" || item.estado === "na_fila";
  const detalhe =
    item.estado === "agendado"
      ? item.repete === "daily" ? " · repete todo dia" : item.repete === "weekly" ? " · repete toda semana" : ""
      : item.total > 0 ? ` · ${numero(item.enviados)} de ${numero(item.total)} grupos` : "";
  return (
    <li className="grid grid-cols-[56px_1fr] gap-3 border-b border-line-200 py-3 last:border-0">
      <span className="text-13 font-semibold leading-tight tabular-nums text-volt-950">{item.hora}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-volt-950">{item.texto}</p>
        <p
          className={cn(
            "mt-0.5 text-13",
            item.estado === "falhou" ? "text-danger-700" : item.estado === "postando" ? "text-success-700" : "text-slate-600",
          )}
        >
          {ROTULO_DO_ESTADO[item.estado]}
          {detalhe}
        </p>
        {emCurso && item.total > 0 && (
          <span className="pn-lotacao mt-2 block" aria-hidden="true">
            <span className="pn-lotacao__cheio" style={{ width: `${Math.round((item.enviados / item.total) * 100)}%` }} />
          </span>
        )}
      </div>
    </li>
  );
}
