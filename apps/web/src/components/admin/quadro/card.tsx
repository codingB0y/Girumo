"use client";

import { isVerificationStale, type BoardFeature } from "@/lib/quadro/status";

const PRIORITY_STYLE: Record<BoardFeature["priority"], string> = {
  alta: "bg-danger-700/10 text-danger-700",
  media: "bg-aco/10 text-aco",
  baixa: "bg-aco/5 text-aco/60",
};

function diasDesde(iso: string, nowMs: number): number {
  return Math.floor((nowMs - Date.parse(iso)) / (24 * 60 * 60 * 1000));
}

interface QuadroCardProps {
  feature: BoardFeature;
  nowMs: number;
}

export function QuadroCard({ feature, nowMs }: QuadroCardProps) {
  const vencido = isVerificationStale(feature, nowMs);

  return (
    <article className="rounded-lg border border-line-200 bg-paper-0 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-volt-950">{feature.title}</h3>
        <span
          className={`font-data shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${PRIORITY_STYLE[feature.priority]}`}
        >
          {feature.priority}
        </span>
      </div>

      <p className="font-data mt-1 text-[10px] uppercase tracking-wider text-aco/55">
        {feature.area}
      </p>

      {feature.summary ? (
        <p className="mt-2 text-xs leading-relaxed text-aco/80">{feature.summary}</p>
      ) : null}

      {feature.blocker ? (
        <p className="mt-2 rounded bg-danger-700/8 px-2 py-1 text-xs leading-relaxed text-danger-700">
          <span className="font-semibold">Trava:</span> {feature.blocker}
        </p>
      ) : null}

      {feature.status === "no_ar_verificado" && feature.evidenceAt ? (
        <p
          className={`font-data mt-2 text-[10px] uppercase tracking-wider ${vencido ? "text-danger-700" : "text-aco/45"}`}
        >
          {vencido ? "⚠ verificação vencida · " : "verificado "}
          há {diasDesde(feature.evidenceAt, nowMs)} dias
          {feature.evidence ? ` · ${feature.evidence}` : ""}
        </p>
      ) : null}
    </article>
  );
}
