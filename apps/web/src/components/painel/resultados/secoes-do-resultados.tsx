// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React from "react";

import Link from "next/link";

import { cn } from "@/lib/utils";

export type SecaoDoResultados = "visao-geral" | "anuncios";

const SECOES: ReadonlyArray<{ chave: SecaoDoResultados; rotulo: string; href: string }> = [
  { chave: "visao-geral", rotulo: "Visão geral", href: "/painel/resultados" },
  { chave: "anuncios", rotulo: "Anúncios", href: "/painel/resultados/anuncios" },
];

/**
 * As seções do Resultados (spec 2026-10-10-funil-anuncios §4). Links, não abas:
 * cada seção tem URL própria, que dá para mandar e para voltar no navegador.
 */
export function SecoesDoResultados({ atual }: { atual: SecaoDoResultados }) {
  return (
    <nav aria-label="Seções do Resultados" className="flex gap-1">
      {SECOES.map((s) => (
        <Link
          key={s.chave}
          href={s.href}
          aria-current={s.chave === atual ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center px-3.5 text-15 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cobalt-500",
            s.chave === atual
              ? "font-semibold text-volt-950 shadow-[inset_0_-2px_0_var(--color-cobalt-500)]"
              : "font-medium text-slate-600 hover:text-volt-950",
          )}
        >
          {s.rotulo}
        </Link>
      ))}
    </nav>
  );
}
