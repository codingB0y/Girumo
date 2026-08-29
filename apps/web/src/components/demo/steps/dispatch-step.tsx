"use client";

import { useEffect, useState } from "react";
import { DEMO_GROUPS } from "@/lib/demo/fixtures";
import { cn } from "@/lib/utils";

/** Cadência da encenação — não é o intervalo real do produto, só o ritmo da animação. */
const TICK_MS = 900;

/**
 * Tela 2 do modo demonstração: o disparo saindo com cadência.
 *
 * A cadência É o argumento de venda — o produto espaça de propósito e só
 * posta no grupo, nunca no privado de ninguém. Cada tick do `setInterval`
 * marca um grupo como "enviado"; o intervalo é limpo assim que os três
 * terminam e sempre no cleanup do efeito, pra não vazar timer entre passos.
 */
export function DispatchStep() {
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSentCount((prev) => {
        if (prev >= DEMO_GROUPS.length) {
          clearInterval(id);
          return prev;
        }
        return prev + 1;
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  return (
    <div data-testid="demo-dispatch-step" className="space-y-4">
      <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">
        aguardando 40s entre grupos — só no grupo, nunca no privado
      </p>

      <ul className="divide-y divide-dashed divide-volt-950/[0.09] rounded-2xl border border-volt-950/10 bg-papel">
        {DEMO_GROUPS.map((group, index) => {
          const sent = index < sentCount;
          return (
            <li
              key={group.name}
              data-testid="demo-dispatch-item"
              data-sent={sent}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="truncate text-sm text-volt-950">{group.name}</span>
              <span
                className={cn(
                  "font-data shrink-0 text-xs uppercase tracking-[0.06em]",
                  sent ? "text-sucesso" : "text-aco/40",
                )}
              >
                {sent ? "Enviado ✓" : "Aguardando…"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
