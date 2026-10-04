"use client";

import { useCasca } from "@/components/painel/casca-context";
import { PageTransition } from "@/components/painel/page-transition";

/** O miolo do painel. No modo foco ocupa a janela inteira; fora dele, a largura e o respiro da barra mobile de sempre. */
export function MioloDoPainel({ children }: { children: React.ReactNode }) {
  const { foco } = useCasca();
  return (
    <main className={foco ? "flex min-h-screen w-full flex-1 flex-col" : "max-w-[var(--content-max)] flex-1 pb-20 lg:pb-0"}>
      <PageTransition>{children}</PageTransition>
    </main>
  );
}
