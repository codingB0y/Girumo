import type { ReactNode } from "react";
import { T, WRAP } from "@/components/pages/templates/v3/tokens";

/** Cabeçalho padrão de seção: eyebrow curto + título + (opcional) frase de apoio. */
export function SectionHead({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  const center = align === "center";
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? <p className={T.eyebrow}>{eyebrow}</p> : null}
      <h2 className={`${eyebrow ? "mt-3" : ""} ${T.h2} text-balance`}>{title}</h2>
      {lead ? <p className={`mt-4 ${T.lead}`}>{lead}</p> : null}
    </div>
  );
}

/**
 * Cartão da direção impacto: superfície um tom acima do fundo, fio fino e um
 * brilho de 1px no topo (a "borda dupla" que faz o cartão parecer peça, não div).
 */
export function Card({
  children,
  className = "",
  tone = "surface",
}: {
  children: ReactNode;
  className?: string;
  tone?: "surface" | "brand";
}) {
  const base =
    tone === "brand"
      ? "bg-[var(--lp-brand-soft)] border-[color:var(--lp-brand)]/30"
      : "bg-[var(--lp-surface)] border-[color:var(--lp-line)]";
  return (
    <div
      className={`rounded-2xl border ${base} shadow-[inset_0_1px_0_var(--lp-glint)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CheckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="10" cy="10" r="9" className="fill-[var(--lp-brand-soft)]" />
      <path
        d="M6 10.5l2.6 2.5L14 7.5"
        className="stroke-[var(--lp-accent)]"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CrossIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="10" cy="10" r="9" className="fill-[var(--lp-chip)]" />
      <path
        d="M7 7l6 6M13 7l-6 6"
        className="stroke-[var(--lp-muted)]"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Título com um trecho na cor da marca. O trecho tem que existir no texto (o
 * validador garante); se não existir, o título sai inteiro sem destaque.
 */
export function Highlighted({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight) return <>{text}</>;
  const i = text.indexOf(highlight);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-[color:var(--lp-accent)]">{highlight}</span>
      {text.slice(i + highlight.length)}
    </>
  );
}

export function Wrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${WRAP} ${className}`}>{children}</div>;
}

/** Selo curto em pílula (badge do hero, etiqueta de dia, "print enviado pela loja"). */
export function Pill({ children, tone = "line" }: { children: ReactNode; tone?: "line" | "brand" }) {
  const cls =
    tone === "brand"
      ? "border-transparent bg-[var(--lp-brand)] text-[color:var(--lp-on-brand)]"
      : "border-[color:var(--lp-line)] bg-[var(--lp-chip)] text-[color:var(--lp-ink)]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] ${cls}`}
    >
      {children}
    </span>
  );
}
