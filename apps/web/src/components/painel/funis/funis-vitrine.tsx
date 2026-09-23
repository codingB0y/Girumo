"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de funnel-step-card.tsx).
import React from "react";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import type { FunnelOverview, FunnelOverviewItem } from "@/lib/funnels/overview";
import { cn } from "@/lib/utils";
import { stepDay, stepTime } from "@/components/painel/messages/funnel/funnel-plan";

export type CampanhaEscolha = { slug: string; name: string; grupos: number };

export type FunisVitrineProps = {
  /** `null` = carregando. */
  overview: FunnelOverview | null;
  erro: string | null;
  campanhas: readonly CampanhaEscolha[];
  escolhendo: boolean;
  escolhida: string | null;
  cancelando: string | null;
  onNovoFunil: () => void;
  onEscolher: (slug: string) => void;
  onCancelar: (item: FunnelOverviewItem) => void;
};

const PILULA =
  "inline-flex min-h-11 items-center justify-center gap-3 rounded-full py-1.5 pl-6 pr-1.5 text-15 font-semibold transition-colors";

/** "qua 30/09" em cima, "08:00" embaixo; sem data a coluna fica vazia. */
function Quando({ iso }: { iso?: string }) {
  if (!iso) return <span className="w-16 shrink-0" />;
  const d = new Date(iso);
  return (
    <span className="flex w-16 shrink-0 flex-col items-center font-data text-volt-950">
      <span className="text-12 uppercase text-slate-600">{stepDay(d).split(" ")[0]}</span>
      <span className="text-20">{stepDay(d).split(" ")[1]}</span>
    </span>
  );
}

function horarios(item: FunnelOverviewItem): string {
  return item.steps
    .filter((s) => s.at && s.status !== "cancelled" && s.status !== "draft" && s.status !== "failed")
    .map((s) => `${stepTime(new Date(s.at as string))} ${s.label.toLowerCase()}`)
    .join(" · ");
}

function Linha({ item, children }: { item: FunnelOverviewItem; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line-200 bg-paper-0 p-4 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
      <div className="flex flex-1 items-center gap-4">
        <Quando iso={item.quando} />
        <div className="min-w-0 flex-1">
          <p className="text-15 font-semibold text-volt-950">
            {item.label} <span className="font-normal text-slate-600">· {item.campaign.name}</span>
          </p>
          <p className="text-13 text-slate-600">{horarios(item)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-20 sm:pl-0">{children}</div>
    </li>
  );
}

export function FunisVitrine(props: FunisVitrineProps) {
  const { overview } = props;
  const total = overview ? overview.agendados.length + overview.enviados.length : 0;

  return (
    <div className="mx-auto w-full max-w-[920px] space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <h1 className="font-display text-32 font-extrabold text-volt-950">Funis</h1>
          <p className="text-15 text-slate-600">Roteiros prontos de disparo, de todas as campanhas. Nada sai sem você confirmar.</p>
        </div>
        <button
          type="button"
          onClick={props.onNovoFunil}
          aria-expanded={props.escolhendo}
          aria-controls="funis-novo"
          className={cn(PILULA, "bg-volt-950 text-paper-0 hover:bg-volt-900")}
        >
          Novo funil
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-acid-500 text-volt-950">
            <Plus aria-hidden className="h-4 w-4" />
          </span>
        </button>
      </header>

      {props.escolhendo && (
        <section id="funis-novo" aria-labelledby="funis-novo-titulo" className="space-y-3 rounded-xl bg-volt-950/[0.04] p-1.5">
          <div className="space-y-4 rounded-lg border border-line-200 bg-paper-0 p-4 sm:p-5">
            <div>
              <h2 id="funis-novo-titulo" className="font-display text-18 font-bold text-volt-950">Para qual campanha?</h2>
              <p className="text-13 text-slate-600">Os grupos e o link de pedido vêm dela.</p>
            </div>
            {props.campanhas.length === 0 ? (
              <p className="text-13 text-slate-600">
                Você ainda não tem campanha. <Link href="/painel/campanhas/nova" className="font-semibold text-cobalt-500">Criar a primeira</Link>
              </p>
            ) : (
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Campanha</legend>
                {props.campanhas.map((c) => (
                  <label
                    key={c.slug}
                    className={cn(
                      "flex min-h-11 items-start gap-3 rounded-xl border bg-paper-0 p-4",
                      props.escolhida === c.slug ? "border-2 border-volt-950" : "border-line-200",
                      c.grupos === 0 && "opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name="funis-campanha"
                      className="mt-0.5 h-5 w-5 accent-cobalt-500"
                      checked={props.escolhida === c.slug}
                      disabled={c.grupos === 0}
                      onChange={() => props.onEscolher(c.slug)}
                    />
                    <span className="flex flex-col">
                      <span className="text-15 font-semibold text-volt-950">{c.name}</span>
                      <span className="text-13 text-slate-600">
                        {c.grupos === 0 ? "sem grupos ainda" : `${c.grupos} ${c.grupos === 1 ? "grupo" : "grupos"}`}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {props.escolhida && (
              <Link
                href={`/painel/campanhas/${encodeURIComponent(props.escolhida)}?abrir=funil`}
                className={cn(PILULA, "w-fit bg-volt-950 text-paper-0 hover:bg-volt-900")}
              >
                Montar o funil
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-acid-500 text-volt-950">
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </span>
              </Link>
            )}
          </div>
        </section>
      )}

      {props.erro && (
        <p role="alert" className="rounded-xl border border-alerta bg-paper-0 p-4 text-13 text-volt-950">{props.erro}</p>
      )}

      {overview === null && !props.erro && <p className="text-13 text-slate-600">Carregando os funis…</p>}

      {overview && total === 0 && (
        <p className="rounded-xl border border-dashed border-line-200 p-6 text-15 text-slate-600">
          Nenhum funil ainda. Comece pela Grade do dia: a semana inteira de grade, montada de uma vez.
        </p>
      )}

      {overview && overview.agendados.length > 0 && (
        <section aria-labelledby="funis-agendados" className="space-y-3">
          <h2 id="funis-agendados" className="font-display text-18 font-bold text-volt-950">
            Agendados <span className="font-data text-13 font-normal text-slate-600">{overview.agendados.length}</span>
          </h2>
          <ul className="space-y-3">
            {overview.agendados.map((item) => (
              <Linha key={item.runId} item={item}>
                <span className="rounded-chip bg-cobalt-500/10 px-2.5 py-1 text-12 font-semibold text-cobalt-700">
                  {item.enviadas}/{item.steps.length} enviadas
                </span>
                {item.pendentes.length === 0 ? (
                  <span className="text-13 text-slate-600">Saindo agora</span>
                ) : (
                <button
                  type="button"
                  onClick={() => props.onCancelar(item)}
                  disabled={props.cancelando === item.runId}
                  className="inline-flex min-h-11 items-center rounded-full border border-line-200 bg-paper-0 px-4 text-13 font-medium text-alerta hover:border-alerta disabled:opacity-60"
                >
                  {props.cancelando === item.runId ? "Cancelando…" : "Cancelar funil"}
                </button>
                )}
              </Linha>
            ))}
          </ul>
        </section>
      )}

      {overview && overview.enviados.length > 0 && (
        <section aria-labelledby="funis-enviados" className="space-y-3">
          <h2 id="funis-enviados" className="font-display text-18 font-bold text-volt-950">Últimos enviados</h2>
          <ul className="space-y-3">
            {overview.enviados.map((item) => (
              <Linha key={item.runId} item={item}>
                {item.offer && (
                  <span className="font-data text-13 text-slate-600">
                    <b className="text-18 text-volt-950">{item.offer.pediram}</b> EU QUERO
                  </span>
                )}
                <Link
                  href={`/painel/campanhas/${encodeURIComponent(item.campaign.slug)}`}
                  className="inline-flex min-h-11 items-center text-13 font-semibold text-cobalt-500"
                >
                  Ver resultados
                </Link>
              </Linha>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
