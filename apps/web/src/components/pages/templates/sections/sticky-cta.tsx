"use client";

import { useEffect, useState } from "react";

/**
 * CTA fixo no mobile — aparece SÓ quando o formulário (#captura) saiu da 1ª dobra
 * (deixou de estar visível). O clique NÃO abre destino nenhum: rola de volta pro
 * mesmo formulário e foca o primeiro campo. Respeita prefers-reduced-motion.
 * A barra fica sempre no DOM (translada pra fora) pra não causar salto de layout;
 * quando escondida, some do fluxo de foco (inerte).
 */
export function StickyCta({ label }: { label: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = document.getElementById("captura");
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), {
      threshold: 0,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function goToForm() {
    const el = document.getElementById("captura");
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }

  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-[#e4dcd0] bg-[#f8f5f0]/95 p-3 backdrop-blur transition-transform duration-200 lg:hidden ${
        show ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
    >
      <button
        type="button"
        onClick={goToForm}
        tabIndex={show ? 0 : -1}
        className="flex w-full items-center justify-center rounded-xl bg-[var(--lp-brand)] px-6 py-3.5 text-base font-semibold text-[color:var(--lp-on-brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--lp-brand)]"
      >
        {label}
      </button>
    </div>
  );
}
