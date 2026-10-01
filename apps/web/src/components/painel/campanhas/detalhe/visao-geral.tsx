"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { CampaignGroupsOverview } from "@/lib/campaign-groups-overview";
import { etaDisparo } from "@/lib/campaigns/dispatch-eta";
import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import { dayBR, dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import { GROUP_FULL_RATIO } from "@/lib/links/resolve-click-target";
import {
  barrasDaAtividade,
  diaDaSemanaPassada,
  semanaPassadaMedida,
  somaDa,
  somaMedida,
  variacao,
  type Barra,
  type Movimento,
} from "@/lib/painel/atividade";
import {
  estadoNaCampanha,
  faixaDeLotacao,
  filtrarGrupos,
  hojeNaCampanha,
  ordenarGrupos,
  quandoDoPost,
  type EntradaRecente,
  type EstadoDoPost,
  type EstadoNaCampanha,
  type FiltroDeGrupos,
} from "@/lib/painel/campanha-visao";
import { aindaSaindo, itemAoVivo, postDaTabela, resumoDaEntrega, type ItemAoVivo } from "@/lib/painel/entrega";
import { lotacao, numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";
import { AnaliseDaCampanha, medindoDesde, useAtividade } from "./analise";
import { CelulaDaEntrega, LegendaDaEntrega, useEntrega } from "./entrega";
import { saldo } from "./grafico-barras";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const LINHAS = 8;

type Props = {
  /** Slug (ou id) da campanha: a série vem de /api/campanhas/[slug]/atividade. */
  slug: string;
  overview: CampaignGroupsOverview;
  /** Entradas por clique (%), null sem clique ou sem a contagem do servidor. */
  taxaEntrada: number | null;
  receita: number;
  pedidos: number;
  /** As entradas mais recentes, lidas no servidor; null se a leitura falhou. */
  ultimas: EntradaRecente[] | null;
  /** null enquanto os posts carregam. */
  posts: DispatchView[] | null;
  /** Quando os dados foram lidos: "hoje" e "agora" saem daqui. */
  agora: Date;
  aoVerGrupos: () => void;
  aoVerPosts: () => void;
};

/**
 * Visão geral da campanha, direção D (spec 2026-09-24): faixa de números num
 * painel só, a análise por hora, dia e mês (série do banco, PRs C e D), a tabela
 * dos grupos com a entrega do post (PR E) e o dia da campanha.
 */
export function VisaoGeralCampanha({ slug, overview: o, taxaEntrada, receita, pedidos, ultimas, posts, agora, aoVerGrupos, aoVerPosts }: Props) {
  const [filtro, setFiltro] = useState<FiltroDeGrupos>("todos");
  const { atividade, erro, tentarDeNovo } = useAtividade(slug, agora.getTime());

  const faixa = useMemo(() => faixaDeLotacao(o.groups), [o.groups]);
  const grupos = useMemo(() => filtrarGrupos(ordenarGrupos(o.groups), filtro), [o.groups, filtro]);
  const seteDias = useMemo(() => (atividade ? barrasDaAtividade(atividade, "7d", "entraram") : null), [atividade]);
  const hoje = useMemo(() => (atividade ? somaMedida(barrasDaAtividade(atividade, "hoje", "entraram", "sairam")) : null), [atividade]);

  // O post que a tabela acompanha grupo a grupo (PR E): o que está saindo, ou o último de hoje.
  const postTabela = useMemo(() => (posts ? postDaTabela(posts, agora) : null), [posts, agora]);
  const { entrega, leitura, desatualizada } = useEntrega(postTabela?.id ?? null, agora.getTime());
  const entregaPorGrupo = useMemo(() => new Map((entrega?.grupos ?? []).map((g) => [g.grupo, g])), [entrega]);
  const resumo = useMemo(() => (entrega ? resumoDaEntrega(entrega.grupos) : null), [entrega]);
  const horaDoPost = postTabela ? horaBR(quandoDoPost(postTabela)) : "";

  // O dia da campanha: posts e grupos abertos sozinhos, com o post em curso na contagem ao vivo.
  const gruposAbertos = useMemo(() => atividade?.gruposAbertosHoje ?? [], [atividade]);
  const abertoHojePorGrupo = useMemo(() => new Map(gruposAbertos.flatMap((g) => (g.grupo ? [[g.grupo, g.quando] as const] : []))), [gruposAbertos]);
  const dia = useMemo((): ItemAoVivo[] | null => {
    if (!posts) return null;
    return hojeNaCampanha(posts, agora, 2, gruposAbertos).map((item) =>
      entrega && resumo && item.id === entrega.postId ? itemAoVivo(item, resumo) : item,
    );
  }, [posts, agora, entrega, resumo, gruposAbertos]);

  const novasHoje = atividade ? somaDa(atividade.porHora, "novas") : null;
  const cliquesHoje = atividade ? somaDa(atividade.porHora, "cliques") : null;
  const filtros: [FiltroDeGrupos, string, number][] = [
    ["todos", "Todos", o.groups.length],
    ["lotados", "Lotados", faixa.lotados],
    ["quase", "Quase", faixa.quase],
    ["com_vaga", "Com vaga", faixa.comVaga],
  ];

  return (
    <div className="space-y-6">
      {/* Faixa de números: um painel só, fio entre as células (gap-px sobre o fundo do fio). */}
      <section
        aria-label="Números da campanha"
        className="grid gap-px overflow-hidden rounded-[10px] border border-line-200 bg-line-200 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.3fr_1fr_1fr_1fr_1.1fr_1fr]"
      >
        <div className="bg-paper-0 px-5 py-4 sm:col-span-2 lg:col-span-1">
          <p className="text-13 text-slate-600">Entraram hoje</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <p className="text-[44px] font-semibold leading-none tabular-nums text-volt-950 [font-stretch:75%]">
              {hoje === null ? "—" : numero(hoje.entraram)}
            </p>
            {seteDias && <Faisca barras={seteDias} />}
          </div>
          <p className="mt-2 text-13 text-slate-600">
            {atividade && hoje ? (
              semanaPassadaMedida(atividade) ? (
                <ContraSemanaPassada
                  hoje={hoje.entraram}
                  antes={atividade.semanaPassada.entraram}
                  diaPassado={diaDaSemanaPassada(dayBR(new Date(atividade.geradoEm)), true)}
                />
              ) : (
                `${medindoDesde(atividade.entradasDesde)} · a comparação com a semana passada começa em 7 dias`
              )
            ) : erro ? (
              "a série não carregou"
            ) : (
              "lendo a série…"
            )}
          </p>
        </div>
        <Celula rotulo="Saíram hoje" valor={hoje === null ? "—" : numero(hoje.sairam)}>
          {hoje && (
            <>
              <EntrouSaiu entraram={hoje.entraram} sairam={hoje.sairam} />
              saldo de {saldo(hoje.entraram - hoje.sairam)} hoje
            </>
          )}
        </Celula>
        <Celula rotulo="Cliques no link hoje" valor={cliquesHoje === null ? "—" : numero(cliquesHoje)}>
          {o.clicks === 0
            ? "ninguém clicou no link ainda"
            : `${numero(o.clicks)} no total · ${taxaEntrada === null ? "—" : `${taxaEntrada}%`} viraram entrada`}
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
        <Celula rotulo="Vendas anotadas" valor={brl.format(receita)} className="sm:col-span-2 lg:col-span-1">
          {pedidos === 0 ? "nenhum pedido desta campanha" : `${numero(pedidos)} ${pedidos === 1 ? "pedido" : "pedidos"}`}
        </Celula>
      </section>

      <AnaliseDaCampanha atividade={atividade} erro={erro} aoTentarDeNovo={tentarDeNovo} posts={posts} />

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
          {postTabela && resumo && resumo.total > 0 && (
            <div className="border-b border-line-200 px-5 py-2.5">
              <LegendaDaEntrega hora={horaDoPost} resumo={resumo} desatualizada={desatualizada} />
            </div>
          )}

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
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Entraram hoje</th>
                    <th scope="col" className={cn("py-2.5 font-medium", postTabela ? "px-3" : "px-5")}>Status</th>
                    {postTabela && <th scope="col" className="px-5 py-2.5 font-medium">Post das {horaDoPost}</th>}
                  </tr>
                </thead>
                <tbody>
                  {grupos.slice(0, LINHAS).map((g) => {
                    const fracao = lotacao(g.members, g.capacity);
                    const movimento = atividade?.hojePorGrupo[g.id];
                    return (
                      <tr key={g.id} className="border-b border-line-200 last:border-0 hover:bg-hover-ficha">
                        <td className="max-w-[280px] px-5 py-2.5">
                          <span className="block truncate font-medium text-volt-950">{g.group?.name ?? "Grupo sem registro"}</span>
                          {abertoHojePorGrupo.has(g.id) && (
                            <span className="block text-12 text-slate-600">aberto hoje às {horaBR(abertoHojePorGrupo.get(g.id))}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-volt-950">{numero(g.members)}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <Lotacao fracao={fracao} className="w-24" />
                            <span className="w-9 text-right tabular-nums text-slate-600">{Math.round(fracao * 100)}%</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-volt-950">
                          <MovimentoDoGrupo movimento={movimento} />
                        </td>
                        <td className={cn("py-2.5", postTabela ? "px-3" : "px-5")}>
                          <SeloDoGrupo estado={estadoNaCampanha(g)} />
                        </td>
                        {postTabela && (
                          <td className="px-5 py-2.5">
                            <CelulaDaEntrega entrega={entregaPorGrupo.get(g.id)} leitura={leitura} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <ul className="sm:hidden">
                {grupos.slice(0, LINHAS).map((g) => {
                  const fracao = lotacao(g.members, g.capacity);
                  const movimento = atividade?.hojePorGrupo[g.id];
                  return (
                    <li key={g.id} className="flex items-center gap-3 border-b border-line-200 px-4 py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-volt-950">{g.group?.name ?? "Grupo sem registro"}</p>
                        {abertoHojePorGrupo.has(g.id) && (
                          <p className="text-12 text-slate-600">aberto hoje às {horaBR(abertoHojePorGrupo.get(g.id))}</p>
                        )}
                        <p className="mt-1.5 flex items-center gap-2 text-12 text-slate-600">
                          <Lotacao fracao={fracao} className="w-14 shrink-0" />
                          <span className="tabular-nums">
                            {numero(g.members)} de {numero(g.capacity)}
                          </span>
                          {movimento && movimento.entraram + movimento.sairam > 0 && (
                            <span className="tabular-nums">
                              · <MovimentoDoGrupo movimento={movimento} /> hoje
                            </span>
                          )}
                        </p>
                        {postTabela && (
                          <p className="mt-1 flex items-center gap-1.5 text-12 text-slate-600">
                            Post das {horaDoPost}: <CelulaDaEntrega entrega={entregaPorGrupo.get(g.id)} leitura={leitura} />
                          </p>
                        )}
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
              {postTabela && resumo && resumo.total > 0 && (
                <span className="hidden md:inline">
                  {" "}
                  · o post das {horaDoPost} {aindaSaindo(resumo) ? "já saiu" : "saiu"} em {numero(resumo.entregues)} de {numero(resumo.total)} grupos
                </span>
              )}
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
              {/* A lista é de quem chegou à base pela 1ª vez: o número ao lado conta a mesma coisa, não "Entraram". */}
              {novasHoje !== null && (
                <span className="text-13 tabular-nums text-slate-600">
                  {numero(novasHoje)} {novasHoje === 1 ? "nova" : "novas"} hoje
                </span>
              )}
            </div>
            {/* Falha de leitura não vira "ninguém entrou": a faixa de números pode estar dizendo o contrário. */}
            {ultimas === null ? (
              <p className="py-4 text-13 text-slate-600">Não deu para ler as últimas entradas.</p>
            ) : ultimas.length === 0 ? (
              <p className="py-4 text-13 text-slate-600">Ninguém entrou pelos grupos desta campanha ainda.</p>
            ) : (
              <ul>
                {ultimas.map((l) => (
                  <li key={l.id} className="flex items-baseline gap-2 border-b border-line-200 py-2.5 text-13 last:border-0">
                    <span className="min-w-0 flex-1 truncate">
                      <strong className="font-semibold text-volt-950">{l.nome}</strong>{" "}
                      <span className="text-slate-600">veio pelo {l.grupo || "grupo"}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {dayBROf(l.entrouEm) === dayBR(agora) ? horaBR(l.entrouEm) : diaMesBR(l.entrouEm)}
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

function Celula({ rotulo, valor, className, children }: { rotulo: string; valor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("bg-paper-0 px-5 py-4", className)}>
      <p className="text-13 text-slate-600">{rotulo}</p>
      <p className="mt-2 text-[30px] font-semibold leading-none tabular-nums text-volt-950 [font-stretch:75%]">{valor}</p>
      <div className="mt-2.5 text-13 text-slate-600">{children}</div>
    </div>
  );
}

/** Hoje contra o mesmo dia da semana passada, até a mesma hora: dia parcial contra dia parcial. */
function ContraSemanaPassada({ hoje, antes, diaPassado }: { hoje: number; antes: number; diaPassado: string }) {
  const delta = variacao(hoje, antes);
  if (delta === null) return <>{numero(antes)} {diaPassado}, mesma hora</>;
  return (
    <>
      <span className={cn("inline-flex items-center font-semibold", delta >= 0 ? "text-success-700" : "text-danger-700")}>
        {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
        {delta > 0 ? "+" : ""}
        {delta}%
      </span>{" "}
      vs {numero(antes)} {diaPassado}, mesma hora
    </>
  );
}

/** "+12 −2" no grupo: saídas na cor de saída; sem movimento, "—". */
function MovimentoDoGrupo({ movimento }: { movimento: Movimento | undefined }) {
  if (!movimento || movimento.entraram + movimento.sairam === 0) return <>—</>;
  return (
    <>
      {movimento.entraram > 0 && <span>+{numero(movimento.entraram)}</span>}
      {movimento.sairam > 0 && <span className="ml-1.5 text-saida">−{numero(movimento.sairam)}</span>}
    </>
  );
}

/** Entraram contra saíram hoje, numa barra só. */
function EntrouSaiu({ entraram, sairam }: { entraram: number; sairam: number }) {
  const total = entraram + sairam;
  return (
    <span className="mb-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-line-200" aria-hidden="true">
      {total > 0 && <span className="bg-serie" style={{ width: `${(entraram / total) * 100}%` }} />}
      {total > 0 && <span className="bg-saida" style={{ width: `${(sairam / total) * 100}%` }} />}
    </span>
  );
}

/** Os últimos 7 dias em miniatura; o de hoje aceso, e dia sem medição só com o traço. */
function Faisca({ barras }: { barras: Barra[] }) {
  const max = Math.max(1, ...barras.map((b) => (b.semMedicao ? 0 : b.valor)));
  return (
    <span className="flex shrink-0 flex-col items-end gap-1" aria-hidden="true">
      <span className="flex h-8 items-end gap-[3px]">
        {barras.map((b) => (
          <span
            key={b.chave}
            className={cn("block w-[5px] rounded-t-[1px]", b.semMedicao ? "bg-line-200" : b.atual ? "bg-serie" : "bg-slate-600/50")}
            style={{ height: b.semMedicao ? 2 : `${Math.max(8, (b.valor / max) * 100)}%` }}
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
  grupo_aberto: "Criado pelo \"Grupo lotou → abre outro\"",
};

function ItemDoDiaLinha({ item }: { item: ItemAoVivo }) {
  const emCurso = item.estado === "postando" || item.estado === "na_fila";
  const restantes = item.restantes ?? item.total - item.enviados;
  const falta = emCurso ? etaDisparo({ sent: item.total - restantes, total: item.total }) : null;
  const detalhe =
    item.estado === "agendado"
      ? item.repete === "daily" ? " · repete todo dia" : item.repete === "weekly" ? " · repete toda semana" : ""
      : item.total > 0 ? ` · ${numero(item.enviados)} de ${numero(item.total)} grupos${falta ? ` · falta ${falta}` : ""}` : "";
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
