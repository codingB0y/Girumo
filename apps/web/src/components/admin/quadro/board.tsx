"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BOARD_STATUSES,
  FEITO_STATUSES,
  STATUS_HINTS,
  STATUS_LABELS,
  WIP_LIMIT_EM_CONSTRUCAO,
  groupByStatus,
  wipState,
  type BoardEvent,
  type BoardFeature,
  type BoardStatus,
} from "@/lib/quadro/status";
import { QuadroCard } from "./card";
import { QuadroFeed } from "./feed";
import { NewCardForm } from "./new-card";

const POLL_MS = 4000;

const WIP_STYLE = {
  ok: "text-aco/45",
  cheio: "text-aco/70",
  estourado: "text-danger-700",
} as const;

/** As colunas fora da cinta "Feito", nos dois lados dela. Derivado da ordem, não fixado à mão. */
const PRIMEIRO_FEITO = BOARD_STATUSES.indexOf(FEITO_STATUSES[0]);
const SOLTAS_ANTES = BOARD_STATUSES.slice(0, PRIMEIRO_FEITO);
const SOLTAS_DEPOIS = BOARD_STATUSES.slice(PRIMEIRO_FEITO + FEITO_STATUSES.length);

interface QuadroBoardProps {
  initial: { features: BoardFeature[]; events: BoardEvent[] };
}

export function QuadroBoard({ initial }: QuadroBoardProps) {
  const [snapshot, setSnapshot] = useState(initial);
  const [area, setArea] = useState<string>("todas");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [failedPolls, setFailedPolls] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/quadro", { cache: "no-store" });
      if (!response.ok) {
        setFailedPolls((n) => n + 1);
        return;
      }
      const data = (await response.json()) as QuadroBoardProps["initial"];
      setSnapshot(data);
      setNowMs(Date.now());
      setFailedPolls(0);
    } catch {
      // Uma falha isolada é transitória; o que importa é a sequência.
      setFailedPolls((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const areas = useMemo(
    () => Array.from(new Set(snapshot.features.map((f) => f.area))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [snapshot.features],
  );

  const visible = area === "todas"
    ? snapshot.features
    : snapshot.features.filter((f) => f.area === area);

  const groups = groupByStatus(visible);

  const renderColuna = (status: BoardStatus) => {
    const cards = groups[status];
    const hasLimit = status === "em_construcao";
    const wip = hasLimit ? wipState(cards.length, WIP_LIMIT_EM_CONSTRUCAO) : "ok";
    const soltaDaCinta = !FEITO_STATUSES.includes(status);

    return (
      <section key={status} className="flex w-64 shrink-0 flex-col gap-2">
        {/* Reserva a altura da cinta "Feito" para os cabeçalhos ficarem na mesma linha. */}
        {soltaDaCinta ? <div className="h-4" aria-hidden="true" /> : null}

        <header className="px-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-data text-[11px] uppercase tracking-wider text-aco/70">
              {STATUS_LABELS[status]}
            </h2>
            <span className={`font-data text-[11px] ${WIP_STYLE[wip]}`}>
              {hasLimit ? `${cards.length}/${WIP_LIMIT_EM_CONSTRUCAO}` : cards.length}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-tight text-aco/45">
            {STATUS_HINTS[status]}
          </p>
        </header>

        {cards.map((feature) => (
          <QuadroCard
            key={feature.id}
            feature={feature}
            nowMs={nowMs}
            onChanged={refresh}
          />
        ))}
      </section>
    );
  };

  // Duas falhas seguidas (~8s) já não são blip de rede — normalmente é o cookie de admin
  // tendo expirado. Sem este aviso a tela mostraria um retrato congelado com cara de
  // fresco, que é exatamente a mentira que este quadro existe pra não contar.
  const stalledSeconds = Math.round((failedPolls * POLL_MS) / 1000);

  return (
    <div className="space-y-4">
      {failedPolls >= 2 ? (
        <p
          role="status"
          className="rounded-lg border border-danger-700/30 bg-danger-700/8 px-3 py-2 text-xs text-danger-700"
        >
          Sem atualizar há {stalledSeconds}s — o que está na tela pode estar velho.
          Se persistir, recarregue a página: sua sessão de admin pode ter expirado.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="quadro-area" className="font-data text-[11px] uppercase tracking-wider text-aco/55">
          Área
        </label>
        <select
          id="quadro-area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="rounded-lg border border-line-200 bg-paper-0 px-2 py-1 text-xs text-volt-950"
        >
          <option value="todas">Todas ({snapshot.features.length})</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <NewCardForm onCreated={refresh} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-2">
          {SOLTAS_ANTES.map(renderColuna)}

          {/* As duas colunas entregues sob uma cinta "Feito": quem procura o feito acha,
              e continua vendo que metade dele ninguém conferiu. */}
          <div className="flex shrink-0 flex-col gap-2">
            <div
              className="flex h-4 items-center justify-center rounded-t-sm border-x border-t border-aco/15 font-data text-[10px] uppercase tracking-[0.2em] text-aco/40"
              aria-hidden="true"
            >
              Feito
            </div>
            <div className="flex gap-3">{FEITO_STATUSES.map(renderColuna)}</div>
          </div>

          {SOLTAS_DEPOIS.map(renderColuna)}
        </div>

        <QuadroFeed events={snapshot.events} features={snapshot.features} />
      </div>
    </div>
  );
}
