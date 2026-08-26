"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { authenticatedFetch } from "@/lib/supabase/client";

type UsageData = {
  campaigns: { used: number; limit: number | null };
  contacts: { used: number; limit: number | null };
};

type Resource = "campaigns" | "contacts";

const LABELS: Record<Resource, { singular: string; plural: string }> = {
  campaigns: { singular: "campanha", plural: "campanhas" },
  contacts: { singular: "contato", plural: "contatos" },
};

interface PlanGateProps {
  /** Which resource to check */
  resource: Resource;
  /** Show inline (small) or as a card */
  variant?: "inline" | "card";
  /** Additional class */
  className?: string;
}

/**
 * Shows current usage vs plan limit.
 * If at limit → shows upgrade CTA.
 * If no limit → renders nothing.
 */
export function PlanGate({ resource, variant = "inline", className }: PlanGateProps) {
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    authenticatedFetch("/api/billing/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUsage)
      .catch(() => {});
  }, []);

  if (!usage) return null;

  const info = usage[resource];
  if (!info || info.limit === null || info.limit < 0) return null;

  const atLimit = info.used >= info.limit;
  const nearLimit = info.used >= info.limit * 0.8;
  /**
   * Teto zero nao e "limite atingido": o cliente nunca criou nenhuma. Dizer
   * "atingiu o limite" a quem esta em 0 de 0 manda ele procurar algo para
   * apagar — o que falta e plano, nao espaco. Mesma distincao que o 402 do
   * gate faz com os codigos plan_blocked e plan_limit_reached.
   */
  const semPlano = info.limit === 0;
  const label = LABELS[resource];
  const pct = info.limit > 0 ? Math.min(Math.round((info.used / info.limit) * 100), 100) : 0;

  // Only show when near or at limit
  if (!nearLimit) return null;

  if (variant === "card") {
    return (
      <div
        className={cn(
          "rounded-2xl border px-5 py-4",
          atLimit
            ? "border-atencao/30 bg-atencao/[0.05]"
            : "border-cobalt-500/20 bg-cobalt-500/[0.03]",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-volt-950">
              {semPlano
                ? `Seu plano não inclui ${label.plural}`
                : atLimit
                  ? `Limite de ${label.plural} atingido`
                  : `${info.used}/${info.limit} ${label.plural} usadas`}
            </p>
            <p className="mt-0.5 text-xs text-aco/60">
              {semPlano
                ? `Escolha um plano pra criar sua primeira ${label.singular}.`
                : atLimit
                  ? `Faça upgrade pra criar mais ${label.plural}.`
                  : `Você está usando ${pct}% do seu plano.`}
            </p>
          </div>
          {atLimit && (
            <Link
              href="/painel/configuracoes"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-acid-500 px-4 py-2.5 text-xs font-semibold text-volt-950 transition-[filter] duration-[var(--duration-micro)] hover:brightness-95"
            >
              <Zap className="h-3.5 w-3.5" aria-hidden /> {semPlano ? "Ver planos" : "Upgrade"}
            </Link>
          )}
        </div>
        {/* Barra de uso — escondida em teto zero: 0% ao lado de um aviso de
            bloqueio le como "ainda tem espaco", que e o oposto do que ocorre. */}
        <div className={cn("mt-3 h-1.5 w-full overflow-hidden rounded-full bg-canvas-100", semPlano && "hidden")}>
          <div
            className={cn(
              "h-full rounded-full transition-all",
              atLimit ? "bg-danger-700" : pct >= 80 ? "bg-warning-700" : "bg-cobalt-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // Inline variant
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
        atLimit ? "bg-danger-700/10 text-danger-700" : "bg-cobalt-500/[0.06] text-cobalt-700",
        className,
      )}
    >
      <span className="font-data font-medium">
        {info.used}/{info.limit}
      </span>
      <span className="text-aco/60">{label.plural}</span>
      {atLimit && (
        <Link
          href="/painel/configuracoes"
          className="ml-auto font-medium underline transition hover:text-volt-950"
        >
          Upgrade
        </Link>
      )}
    </div>
  );
}
