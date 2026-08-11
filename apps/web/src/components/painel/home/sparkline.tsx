"use client";

import { cn } from "@/lib/utils";
import { sparklinePoints } from "@/lib/sparkline";

const SPARK_W = 120;
const SPARK_H = 22;

/**
 * Tendência dos últimos 14 dias. Puramente decorativo: o número que ele
 * acompanha já está no card, e o resumo em texto vai no `sub` do KPI — por
 * isso `aria-hidden`.
 */
export function Sparkline({ values, tone }: { values: number[]; tone: "cobalt" | "sucesso" }) {
  const points = sparklinePoints(values, SPARK_W, SPARK_H);
  if (!points) return null;

  const moved = values.some((v) => v > 0);

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="mt-3 h-[22px] w-full"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={cn(
          moved
            ? tone === "sucesso"
              ? "stroke-sucesso"
              : "stroke-cobalt-500"
            : // Janela sem movimento: linha na base, discreta.
              "stroke-aco/25",
        )}
      />
    </svg>
  );
}
