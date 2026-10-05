"use client";

import { useCasca } from "@/components/painel/casca-context";
import { PageTransition } from "@/components/painel/page-transition";

/** O miolo do painel. No modo foco ocupa a janela inteira; fora dele, centrado a 90rem sob a barra de cima (spec G2, decisão 4), com o respiro da barra mobile. */
export function MioloDoPainel({ children }: { children: React.ReactNode }) {
  const { foco } = useCasca();
  return (
    <main className={foco ? "flex min-h-screen w-full flex-1 flex-col" : "mx-auto w-full max-w-[90rem] flex-1 pb-20 lg:pb-0"}>
      <PageTransition>{children}</PageTransition>
    </main>
  );
}
