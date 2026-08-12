"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { EmptyState } from "@/components/painel/empty-state";
import { TRIGGER_LABELS } from "@/lib/automations/trigger-labels";
import { formatDateTime } from "@/lib/upcoming-schedules";
import type { Automation } from "./types";

/** Quantas automações ligadas cabem no card. */
const MAX_ITEMS = 4;

/**
 * Automações ligadas e quando cada uma rodou pela última vez.
 *
 * Só leitura — ligar, desligar e editar continuam em `/painel/automacoes`.
 * Toda automação posta no grupo; nenhuma manda DM (decisão anti-ban), então o
 * card não fala em "mensagem para o contato".
 */
export function AutomationsSummary({ automations }: { automations: Automation[] }) {
  const active = useMemo(() => automations.filter((a) => a.enabled), [automations]);

  if (automations.length === 0) {
    return (
      <EmptyState
        icon={Zap}
        title="Nenhuma automação criada"
        description="Uma automação posta sozinha no grupo quando algo acontece — alguém entra, o grupo lota, a semana vira."
        ctaLabel="Criar automação"
        ctaHref="/painel/automacoes"
      />
    );
  }

  if (active.length === 0) {
    return (
      <div className="pn-card rounded-2xl px-5 py-4">
        <p className="text-sm font-medium text-volt-950">
          {automations.length === 1
            ? "Sua automação está desligada"
            : `Suas ${automations.length} automações estão desligadas`}
        </p>
        <p className="mt-1 text-xs text-aco/65">
          Enquanto estiverem desligadas, nada é postado nos grupos automaticamente.
        </p>
        <Link
          href="/painel/automacoes"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cobalt-500 transition hover:text-cobalt-700"
        >
          Ver automações →
        </Link>
      </div>
    );
  }

  return (
    <ul className="pn-card rounded-2xl p-2">
      {active.slice(0, MAX_ITEMS).map((a) => {
        const trigger = TRIGGER_LABELS[a.trigger];
        const Icon = trigger?.icon ?? Zap;
        const lastRun = formatDateTime(a.lastRunAt);

        return (
          <li key={a.id}>
            <Link
              href="/painel/automacoes"
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors duration-[160ms] hover:bg-poco"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sucesso/10 text-sucesso">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-volt-950">{a.name}</span>
                  <span className="font-data block truncate text-[11px] text-aco/55">
                    {trigger?.label ?? "Gatilho personalizado"}
                  </span>
                </span>
              </span>
              <span className="font-data shrink-0 text-right text-[11px] tabular-nums text-aco/70">
                {lastRun ? (
                  <>
                    <span className="block text-aco/45">última</span>
                    {lastRun}
                  </>
                ) : (
                  "ainda não rodou"
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
