"use client";

import { useEffect, useState } from "react";
import { DEMO_LEADS } from "@/lib/demo/fixtures";

/** Cadência da encenação — cada contato revelado é um "clicou e entrou". */
const TICK_MS = 700;

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Tela 3 do modo demonstração: o grupo enchendo.
 *
 * Revela `DEMO_LEADS` um a um, com contador acumulado — mesmo formato de
 * linha de `/painel/contatos` (avatar com iniciais, nome, telefone mascarado,
 * grupo de origem), porque o ponto do demo é mostrar o produto de verdade.
 */
export function GroupStep() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev >= DEMO_LEADS.length) {
          clearInterval(id);
          return prev;
        }
        return prev + 1;
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  const visibleLeads = DEMO_LEADS.slice(0, visibleCount);

  return (
    <div data-testid="demo-group-step" className="space-y-4">
      <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55" data-testid="demo-group-counter">
        {visibleCount} de {DEMO_LEADS.length} contatos
      </p>

      <div className="divide-y divide-dashed divide-volt-950/[0.09] rounded-2xl border border-volt-950/10 bg-papel">
        {visibleLeads.map((lead) => (
          <div key={lead.id} data-testid="demo-group-lead" className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cobalt-500/10 font-data text-xs font-medium text-cobalt-500">
              {initialsOf(lead.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-volt-950">{lead.name}</p>
              <p className="font-data text-[11px] text-aco/55">{lead.phone}</p>
            </div>
            <p className="max-w-[45%] truncate text-right text-xs text-aco">{lead.sourceGroup}</p>
          </div>
        ))}

        {visibleLeads.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-aco/50">Aguardando o primeiro contato…</p>
        ) : null}
      </div>
    </div>
  );
}
