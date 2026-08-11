"use client";

import { ArrowDownRight, ArrowUpRight, Minus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export function SinceYesterday({ leadsToday, deltaLeads }: { leadsToday: number; deltaLeads: number }) {
  if (leadsToday === 0 && deltaLeads === 0) return null;

  const isUp = deltaLeads > 0;
  const isDown = deltaLeads < 0;

  return (
    <div className="pn-card rounded-2xl px-5 py-4">
      <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">Desde ontem</p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-cobalt-500" strokeWidth={1.75} />
          <span className="font-data text-lg font-medium tabular-nums text-volt-950">{leadsToday}</span>
          <span className="text-sm text-aco/70">
            {leadsToday === 1 ? "contato novo" : "contatos novos"} hoje
          </span>
        </div>

        {deltaLeads !== 0 && (
          <span
            className={cn(
              "pn-pop inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-data text-xs font-medium tabular-nums",
              isUp && "bg-sucesso/10 text-sucesso",
              isDown && "bg-alerta/10 text-alerta",
            )}
          >
            {isUp ? (
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
            )}
            {/* Aria-hidden na versão curta + texto completo pra leitor de tela:
                "+3 vs ontem" depende da cor e da seta pra dizer se é bom. */}
            <span aria-hidden="true">
              {isUp ? "+" : ""}
              {deltaLeads} vs ontem
            </span>
            <span className="sr-only">
              {Math.abs(deltaLeads)} {Math.abs(deltaLeads) === 1 ? "contato" : "contatos"}{" "}
              {isUp ? "a mais" : "a menos"} que ontem
            </span>
          </span>
        )}

        {deltaLeads === 0 && leadsToday > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-poco px-2.5 py-1 font-data text-xs text-aco/60">
            <Minus className="h-3 w-3" />
            Igual a ontem
          </span>
        )}
      </div>
    </div>
  );
}
