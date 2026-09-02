"use client";

import { useEffect, useState } from "react";

const UNITS: { key: "d" | "h" | "m" | "s"; label: string }[] = [
  { key: "d", label: "dias" },
  { key: "h", label: "horas" },
  { key: "m", label: "min" },
  { key: "s", label: "seg" },
];

function remaining(endsAt: number, now: number) {
  const total = Math.max(0, Math.floor((endsAt - now) / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
    over: total === 0,
  };
}

/**
 * Contagem regressiva com data REAL (`ends_at` gravado na página). Renderiza
 * traços no servidor e só conta depois de montar — sem isso o HTML do cache e o
 * do cliente divergem (hydration) porque o relógio anda entre os dois.
 * Passou a data: mostra "encerrado" em vez de zerar e seguir mentindo.
 */
export function Countdown({ endsAt }: { endsAt: string }) {
  const target = Date.parse(endsAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const r = now === null || Number.isNaN(target) ? null : remaining(target, now);

  if (r?.over) {
    return (
      <p className="font-mono text-sm uppercase tracking-[0.18em] text-[color:var(--lp-muted)]">
        Encerrado
      </p>
    );
  }

  return (
    <div className="flex gap-2" role="timer" aria-live="off">
      {UNITS.map((u) => (
        <div
          key={u.key}
          className="min-w-[64px] rounded-xl border border-[color:var(--lp-line)] bg-white/[0.04] px-2 py-2.5 text-center"
        >
          <span className="block [font-family:var(--lp-font-display)] text-[1.75rem] font-extrabold leading-none tabular-nums text-[color:var(--lp-ink)]">
            {r ? String(r[u.key]).padStart(2, "0") : "--"}
          </span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--lp-muted)]">
            {u.label}
          </span>
        </div>
      ))}
    </div>
  );
}
