import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ABAS = [
  { id: "conversas", href: "/painel/instagram", rotulo: "Conversas" },
  { id: "fluxos", href: "/painel/instagram/fluxos", rotulo: "Fluxos" },
  { id: "pessoas", href: "/painel/instagram/pessoas", rotulo: "Pessoas" },
] as const;

export type AbaDoInstagram = (typeof ABAS)[number]["id"];

/** As abas do Instagram. Conversas é a primeira e a padrão; `aguardando` põe o contador nela. */
export function AbasInstagram({ ativa, aguardando = 0 }: { ativa: AbaDoInstagram; aguardando?: number }) {
  return (
    <nav aria-label="Seções do Instagram" className="mt-4 flex gap-1 border-b border-line-200">
      {ABAS.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          aria-current={a.id === ativa ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-13 font-medium lg:h-10",
            a.id === ativa ? "border-volt-950 text-volt-950" : "border-transparent text-slate-600 hover:text-volt-950",
          )}
        >
          {a.rotulo}
          {a.id === "conversas" && aguardando > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cobalt-500 px-1.5 text-12 font-semibold tabular-nums text-paper-0">
              {aguardando}
              <span className="sr-only"> aguardando você</span>
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
