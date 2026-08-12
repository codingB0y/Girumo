"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BOARD_STATUSES,
  STATUS_LABELS,
  WIP_LIMIT_EM_CONSTRUCAO,
  groupByStatus,
  wipState,
  type BoardEvent,
  type BoardFeature,
} from "@/lib/quadro/status";
import { QuadroCard } from "./card";
import { QuadroFeed } from "./feed";

const POLL_MS = 4000;

const WIP_STYLE = {
  ok: "text-aco/45",
  cheio: "text-aco/70",
  estourado: "text-danger-700",
} as const;

interface QuadroBoardProps {
  initial: { features: BoardFeature[]; events: BoardEvent[] };
}

export function QuadroBoard({ initial }: QuadroBoardProps) {
  const [snapshot, setSnapshot] = useState(initial);
  const [area, setArea] = useState<string>("todas");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelado = false;

    async function puxar() {
      try {
        const resposta = await fetch("/api/admin/quadro", { cache: "no-store" });
        if (!resposta.ok) return;
        const dados = (await resposta.json()) as QuadroBoardProps["initial"];
        if (!cancelado) {
          setSnapshot(dados);
          setNowMs(Date.now());
        }
      } catch {
        // Falha de rede é transitória: o próximo ciclo tenta de novo.
      }
    }

    const timer = setInterval(puxar, POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, []);

  const areas = useMemo(
    () => Array.from(new Set(snapshot.features.map((f) => f.area))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [snapshot.features],
  );

  const visiveis = area === "todas"
    ? snapshot.features
    : snapshot.features.filter((f) => f.area === area);

  const grupos = groupByStatus(visiveis);

  return (
    <div className="space-y-4">
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
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-2">
          {BOARD_STATUSES.map((status) => {
            const cards = grupos[status];
            const temLimite = status === "em_construcao";
            const estado = temLimite ? wipState(cards.length, WIP_LIMIT_EM_CONSTRUCAO) : "ok";

            return (
              <section key={status} className="flex w-64 shrink-0 flex-col gap-2">
                <header className="flex items-baseline justify-between px-1">
                  <h2 className="font-data text-[11px] uppercase tracking-wider text-aco/70">
                    {STATUS_LABELS[status]}
                  </h2>
                  <span className={`font-data text-[11px] ${WIP_STYLE[estado]}`}>
                    {temLimite ? `${cards.length}/${WIP_LIMIT_EM_CONSTRUCAO}` : cards.length}
                  </span>
                </header>

                {cards.map((feature) => (
                  <QuadroCard key={feature.id} feature={feature} nowMs={nowMs} />
                ))}
              </section>
            );
          })}
        </div>

        <QuadroFeed events={snapshot.events} features={snapshot.features} />
      </div>
    </div>
  );
}
