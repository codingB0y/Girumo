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
            : "border-iris/20 bg-iris/[0.03]",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-breu">
              {atLimit
                ? `Limite de ${label.plural} atingido`
                : `${info.used}/${info.limit} ${label.plural} usadas`}
            </p>
            <p className="mt-0.5 text-xs text-aco/60">
              {atLimit
                ? `Faça upgrade pra criar mais ${label.plural}.`
                : `Você está usando ${pct}% do seu plano.`}
            </p>
          </div>
          {atLimit && (
            <Link
              href="/painel/configuracoes"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-iris px-4 py-2.5 text-xs font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
            >
              <Zap className="h-3.5 w-3.5" /> Upgrade
            </Link>
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bruma">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: atLimit ? "#D84040" : pct >= 80 ? "#D99B2A" : "#6A4BF0",
            }}
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
        atLimit ? "bg-atencao/10 text-atencao" : "bg-iris/[0.06] text-iris",
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
          className="ml-auto font-medium underline transition hover:text-breu"
        >
          Upgrade
        </Link>
      )}
    </div>
  );
}
