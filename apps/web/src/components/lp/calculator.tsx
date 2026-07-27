"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Calculadora do trabalho manual: grupos × posts/dia × 1min30 × 30 dias.
 * Premissa declarada na tela — sem número mágico escondido.
 */
export function ManualCostCalculator({ signupUrl }: { signupUrl: string }) {
  const [groups, setGroups] = useState(40);
  const [posts, setPosts] = useState(3);

  const hours = useMemo(() => Math.round((groups * posts * 1.5 * 30) / 60), [groups, posts]);
  const workdays = useMemo(() => (hours / 8).toFixed(0), [hours]);

  return (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
      <div>
        <Slider
          label="Grupos que você opera"
          value={groups}
          display={`${groups}`}
          min={5}
          max={150}
          step={5}
          onChange={setGroups}
        />
        <div className="mt-9">
          <Slider
            label="Posts por dia em cada grupo"
            value={posts}
            display={`${posts}`}
            min={1}
            max={8}
            step={1}
            onChange={setPosts}
          />
        </div>
        <p className="lp3-mono mt-9 text-[10px] text-[var(--lp-muted)]">
          premissa: 1min30 por grupo por post, 30 dias no mês
        </p>
      </div>

      <div className="lp3-card p-9 text-center md:p-12">
        <p className="lp3-mono text-[11px] text-[var(--lp-muted)]">todo mês você gasta</p>
        <p className="mt-4 text-6xl font-extrabold tracking-tight text-[var(--lp-accent)] md:text-7xl" aria-live="polite">
          {hours}h
        </p>
        <p className="mt-2 text-sm text-[var(--lp-muted)]">
          copiando e colando a mesma oferta — quase {workdays} dias úteis de trabalho.
        </p>
        <div className="my-7 h-px bg-[var(--lp-line)]" aria-hidden />
        <p className="text-base font-medium">
          Com a {BRAND.name}, você organiza essa rotina em um fluxo só.
        </p>
        <a href={signupUrl} className="lp3-btn lp3-btn-ink mt-6">
          Criar minha campanha <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-sm text-[var(--lp-muted)]">{label}</span>
        <span className="font-mono text-base font-semibold">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="lp3-range mt-4 w-full"
        aria-label={label}
      />
    </label>
  );
}
