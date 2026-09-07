"use client";

import { useEffect } from "react";
import { useFocusTrap } from "./use-focus-trap";

type Props = {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  testId: string;
  children: React.ReactNode;
};

/**
 * Bottom sheet da casca mobile (spec Vitrine Aberta, 3.2): alça 32x4, Fechar em
 * texto, corpo rola até 90vh. Esc, o fundo e o Fechar fecham; o foco fica preso
 * dentro enquanto está aberta.
 */
export function Folha({ aberta, aoFechar, titulo, testId, children }: Props) {
  const ref = useFocusTrap<HTMLDivElement>(aberta);

  useEffect(() => {
    if (!aberta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberta, aoFechar]);

  if (!aberta) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label="Fechar" onClick={aoFechar} className="absolute inset-0 bg-volt-950/60" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={titulo} data-testid={testId} className="pn-folha">
        <div className="pn-folha__alca" aria-hidden="true" />
        <div className="flex items-center justify-between pl-4 pr-1">
          <h2 className="font-brand text-20 font-bold text-volt-950">{titulo}</h2>
          <button type="button" onClick={aoFechar} className="pn-folha__fechar">
            Fechar
          </button>
        </div>
        <div className="pn-folha__corpo">{children}</div>
      </div>
    </div>
  );
}
