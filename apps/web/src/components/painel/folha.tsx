"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "./use-focus-trap";

type Props = {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  testId: string;
  /** Pra `aria-controls` no botão que abre. */
  id?: string;
  /**
   * Por padrão a folha é peça da casca MOBILE (`lg:hidden`), porque os gatilhos
   * dela vivem na `BarraMobile`, que também some no desktop. Quem abre a folha
   * a partir de um botão que aparece em qualquer largura precisa disto — sem
   * ele o clique não produz nada em tela larga, sem erro e sem log.
   */
  emQualquerLargura?: boolean;
  children: React.ReactNode;
};

const RAIZ = '[data-testid="painel-root"]';

/**
 * Bottom sheet da casca mobile (spec Vitrine Aberta, 3.2): alça 32x4, Fechar em
 * texto, corpo rola até 90vh. Esc, o fundo e o Fechar fecham; o foco fica preso
 * dentro e o resto da tela vira `inert` enquanto está aberta. Vai pro body por
 * portal, porque a raiz do painel é justamente o que fica inerte.
 */
export function Folha({ aberta, aoFechar, titulo, testId, id, emQualquerLargura, children }: Props) {
  // Antes do focus trap de propósito: a limpeza corre na ordem de declaração, e o
  // foco só consegue voltar pro botão que abriu depois de a raiz deixar de ser inerte.
  useEffect(() => {
    if (!aberta) return;
    const raiz = document.querySelector<HTMLElement>(RAIZ);
    if (raiz) raiz.inert = true;
    return () => {
      if (raiz) raiz.inert = false;
    };
  }, [aberta]);

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

  return createPortal(
    <div
      className={cn("font-body fixed inset-0 z-50 text-volt-950", !emQualquerLargura && "lg:hidden")}
    >
      <button type="button" aria-label="Fechar" onClick={aoFechar} className="absolute inset-0 bg-volt-950/60" />
      <div
        ref={ref}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        data-testid={testId}
        className={cn("pn-folha", emQualquerLargura && "pn-folha--dialogo")}
      >
        <div className="pn-folha__alca" aria-hidden="true" />
        <div className="flex items-center justify-between pl-4 pr-1">
          <h2 className="font-brand text-20 font-bold text-volt-950">{titulo}</h2>
          <button type="button" onClick={aoFechar} className="pn-folha__fechar">
            Fechar
          </button>
        </div>
        <div className="pn-folha__corpo">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
