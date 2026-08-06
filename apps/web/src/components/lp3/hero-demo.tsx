"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { WhatsAppIcon } from "@/components/landing/icons";

const GRUPOS = [
  { name: "VIP 01 · Atacado", extra: null, delay: "0.2s" },
  { name: "VIP 02 · Pronta entrega", extra: null, delay: "0.6s" },
  { name: "VIP 03 · Outlet", extra: "+44", delay: "1s" },
] as const;

const ORDERS_START = 128;
/** Os pedidos entram em dois lotes depois do disparo — [atraso ms, quantidade]. */
const ORDER_BUMPS: ReadonlyArray<readonly [number, number]> = [
  [1700, 3],
  [2700, 4],
];

/**
 * Demo interativa do hero mobile: o visitante dispara nos 47 grupos sem cadastro.
 * Os status trocam pra "entregue" em cascata e o contador de pedidos sobe.
 * Nada de fetch — é encenação; toda a mudança é state local.
 */
export function HeroDemo() {
  const [blasted, setBlasted] = useState(false);
  const [orders, setOrders] = useState(ORDERS_START);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  const blast = () => {
    if (blasted) return;
    setBlasted(true);
    timers.current = ORDER_BUMPS.map(([delay, amount]) =>
      setTimeout(() => setOrders((n) => n + amount), delay),
    );
  };

  const reset = () => {
    clearTimers();
    setBlasted(false);
    setOrders(ORDERS_START);
  };

  return (
    <div className="lp4-window mt-7 text-left">
      <div className="lp4-chrome">
        <i />
        <i />
        <span className="lp4-mono ml-1.5 text-[8px] text-[var(--body)]">
          girumo · demo ao vivo — sem cadastro
        </span>
      </div>

      <div className="p-4">
        <p className="rounded-xl border border-[var(--line)] bg-[rgba(242,241,234,0.04)] px-3.5 py-3 text-[13px] leading-relaxed">
          Grade nova 214 — 40 peças. Manda “EU QUERO”.
        </p>

        {blasted ? (
          <p
            role="status"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-[rgba(167,255,47,0.4)] bg-[rgba(96,142,20,0.12)] py-[15px] text-sm font-semibold leading-none text-[var(--green)]"
          >
            <Check className="h-[15px] w-[15px]" aria-hidden /> Disparado — 47 grupos em 3s
          </p>
        ) : (
          <button
            type="button"
            onClick={blast}
            className="lp4-btn lp4-btn-green mt-3 w-full justify-center py-[15px] text-sm"
          >
            <WhatsAppIcon className="h-[15px] w-[15px]" aria-hidden /> Disparar nos 47 grupos
          </button>
        )}

        <div className="mt-3 flex flex-col gap-1.5" aria-live="polite">
          {GRUPOS.map((g) => (
            <div
              key={g.name}
              className="flex items-center justify-between rounded-[10px] border border-[var(--line)] px-3 py-2.5"
            >
              <span className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-[var(--green-deep)]" aria-hidden>
                  <WhatsAppIcon className="h-3 w-3 text-[var(--green)]" />
                </span>
                <span className="text-xs font-semibold">
                  {g.name}
                  {g.extra && <span className="font-normal text-[var(--body)]"> {g.extra}</span>}
                </span>
              </span>
              {blasted ? (
                <span
                  className="lp4-mono lp4-pop flex items-center gap-1.5 text-[8px] tracking-[0.1em] text-[var(--green)]"
                  style={{ animationDelay: g.delay }}
                >
                  <Check className="h-3 w-3" aria-hidden /> entregue
                </span>
              ) : (
                <span className="lp4-mono text-[8px] tracking-[0.1em] text-[var(--body)]">na fila</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-[rgba(167,255,47,0.25)] bg-[rgba(96,142,20,0.08)] px-3.5 py-3">
          <span className="lp4-mono text-[8px] text-[var(--body)]">pedidos hoje</span>
          <span className="flex items-baseline gap-2">
            <span className="lp4-x text-[26px] text-[var(--green)]">{orders}</span>
            {blasted && (
              <span
                className="lp4-mono lp4-pop text-[8px] tracking-[0.1em] text-[var(--green)]"
                style={{ animationDelay: "1.7s" }}
              >
                subindo
              </span>
            )}
          </span>
        </div>

        {blasted && (
          <button
            type="button"
            onClick={reset}
            className="lp4-mono mt-2.5 w-full text-center text-[8px] text-[var(--body)] underline"
          >
            refazer a demo
          </button>
        )}
      </div>
    </div>
  );
}
