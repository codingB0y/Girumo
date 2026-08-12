"use client";

import { useEffect, useRef } from "react";

import { FOCUSABLE_SELECTOR, isTabbable, resolveTabTarget } from "@/lib/focus-trap";

/** Elementos tabuláveis do modal, na ordem em que aparecem no DOM. */
function tabbablesOf(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isTabbable);
}

/**
 * Prende o foco dentro de um modal enquanto ele estiver aberto e devolve o foco
 * a quem o abriu quando ele fecha.
 *
 * A decisão de para onde o Tab vai mora em `@/lib/focus-trap` (pura, testada);
 * aqui só ficam as partes que precisam do DOM.
 *
 * @param active o modal está aberto
 * @returns ref para pendurar no elemento com `role="dialog"`
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Quem tinha o foco antes de abrir — é para cá que ele volta no fim.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Foco inicial: primeiro elemento útil, a menos que algo dentro já o tenha.
    if (!container.contains(document.activeElement)) {
      tabbablesOf(container)[0]?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const items = tabbablesOf(container);
      const focused = document.activeElement;
      const index = focused instanceof HTMLElement ? items.indexOf(focused) : -1;
      const decision = resolveTabTarget(items.length, index, event.shiftKey);

      if (decision.type === "browser") return;
      event.preventDefault();
      if (decision.type === "move") items[decision.index]?.focus();
    };

    // Captura: o modal decide antes de qualquer handler da página atrás dele.
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Só devolve o foco se o gatilho ainda existir (o modal pode ter navegado).
      if (opener?.isConnected) opener.focus();
    };
  }, [active]);

  return containerRef;
}
