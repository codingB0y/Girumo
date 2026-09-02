"use client";

import { WhatsAppIcon } from "@/components/landing/icons";

/** Rola até o formulário (#captura) e foca o primeiro campo. Não abre destino. */
export function scrollToForm(): void {
  const el = document.getElementById("captura");
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
}

/**
 * Botão de CTA repetido (faixa, cabeçalho): mesma frase do formulário. `invert`
 * é para fundo na cor da marca (faixa): o botão vira tinta sobre a marca.
 */
export function ToFormButton({ label, invert = false }: { label: string; invert?: boolean }) {
  const cls = invert
    ? "bg-[var(--lp-on-brand)] text-[color:var(--lp-brand)] hover:opacity-95"
    : "bg-[var(--lp-brand)] text-[color:var(--lp-on-brand)] hover:opacity-90";
  return (
    <button
      type="button"
      onClick={scrollToForm}
      className={`inline-flex items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-base font-semibold transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--lp-accent)] ${cls}`}
    >
      <WhatsAppIcon className="h-5 w-5" aria-hidden />
      {label}
    </button>
  );
}
