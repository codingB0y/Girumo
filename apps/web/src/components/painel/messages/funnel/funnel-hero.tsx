import { anchorValues } from "@/lib/funnels/render";
import type { FunnelTemplateId } from "@/lib/funnels/templates";
import { cn } from "@/lib/utils";
// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de brand/logo.tsx).
import React from "react";

const FRASE: Readonly<Record<FunnelTemplateId, (dia: string) => string>> = {
  "grade-do-dia": (dia) => `A grade de ${dia}, pronta pro grupo.`,
  "evento-2-dias": (dia) => `Seu evento de 2 dias começa ${dia}.`,
  live: (dia) => `Sua live de ${dia}, pronta pra vender.`,
  "black-friday-atacado": (dia) => `Sua Black do atacado, ${dia}.`,
};

type Props = {
  templateId: FunnelTemplateId;
  templateLabel: string;
  anchor: Date | null;
  mensagens: number;
  grupos: number;
  revendedoras: number;
  relampagos: number;
};

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Única peça escura da tela (letreiro Volt). Liso: a Vitrine proíbe gradiente. */
export function FunnelHero(p: Props) {
  const frase = p.anchor ? FRASE[p.templateId](anchorValues(p.anchor).dia) : "Escolha a data para montar o roteiro.";
  return (
    <section
      aria-labelledby="funil-hero-titulo"
      className="rounded-xl border border-volt-800 bg-volt-950 p-6 text-paper-0 shadow-[var(--shadow-pn-escura)] sm:p-8"
    >
      <p className="font-data text-12 uppercase tracking-[0.08em] text-paper-0/80">Funil · {p.templateLabel}</p>
      <h2 id="funil-hero-titulo" className="font-display mt-3 text-28 font-bold tracking-[-0.02em] sm:text-32">
        {frase}
      </h2>
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Numero valor={p.mensagens} rotulo={plural(p.mensagens, "mensagem", "mensagens")} />
        <Numero valor={p.grupos} rotulo={plural(p.grupos, "grupo", "grupos")} />
        <Numero valor={p.revendedoras} rotulo={plural(p.revendedoras, "revendedora", "revendedoras")} />
        <Numero valor={p.relampagos} rotulo={plural(p.relampagos, "oferta relâmpago", "ofertas relâmpago")} destaque />
      </dl>
    </section>
  );
}

function Numero({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-1">
      <dt className="font-data text-12 uppercase tracking-[0.08em] text-paper-0/80">{rotulo}</dt>
      <dd className={cn("font-data text-28 tabular-nums", destaque && "text-acid-500")}>
        {valor.toLocaleString("pt-BR")}
      </dd>
    </div>
  );
}
