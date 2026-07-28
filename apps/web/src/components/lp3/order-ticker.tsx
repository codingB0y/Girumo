"use client";

import { useEffect, useState } from "react";

/**
 * Régua de pedidos — elemento proprietário da /lp2.
 * Fila decorativa de pedidos "pingando" com origem, em verde-venda.
 * Dados fictícios plausíveis (nomes + valores de grade de atacado).
 * Decorativa: aria-hidden; pausa com a aba oculta e em reduced-motion.
 */
const ORDERS = [
  { name: "Marina S.", value: "R$ 186", origin: "anúncio" },
  { name: "Cleide R.", value: "R$ 342", origin: "grupo vip 12" },
  { name: "Ana Paula", value: "R$ 518", origin: "story" },
  { name: "João V.", value: "R$ 264", origin: "bio" },
  { name: "Rose F.", value: "R$ 1.240", origin: "anúncio" },
  { name: "Edna M.", value: "R$ 396", origin: "grupo vip 07" },
] as const;

const VISIBLE = 3;

export function OrderTicker() {
  const [head, setHead] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setHead((h) => h + 1);
    }, 2600);
    return () => window.clearInterval(id);
  }, []);

  const visible = Array.from({ length: VISIBLE }, (_, i) => {
    const idx = (head + i) % ORDERS.length;
    return { ...ORDERS[idx], key: head + i };
  });

  return (
    <div aria-hidden className="flex items-center gap-3 overflow-hidden">
      <span className="lp4-mono shrink-0 text-[9px] text-[var(--body)]">pedidos chegando</span>
      <span className="lp4-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--green)]" />
      <div className="flex min-w-0 gap-2.5">
        {visible.map((o, i) => (
          <div
            key={o.key}
            className={`lp4-ticker-item flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--bg-2)] py-2 pl-3.5 pr-4 ${
              i === 2 ? "hidden lg:flex" : i === 1 ? "hidden sm:flex" : "flex"
            }`}
          >
            <span className="text-xs font-semibold">{o.name}</span>
            <span className="lp4-mono text-[10px] text-[var(--green)]">{o.value}</span>
            <span className="lp4-mono text-[9px] text-[var(--body)]">{o.origin}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
