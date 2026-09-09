"use client";

import Link from "next/link";
import type { Lead } from "@/components/painel/home/types";
import { diaHoraCurto, iniciais } from "@/lib/painel/inicio";
import { cn } from "@/lib/utils";

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Bloco 3 (12.3): as últimas entradas como fichas de 56px, filete Zap em quem
 * chegou nas últimas 24h. Regra 6: nome como veio do contato, mas a tela toda
 * é autenticada, então aqui pode ser o nome inteiro.
 */
export function QuemChegou({
  leads,
  semana,
  total,
  limite,
  agora,
}: {
  leads: readonly Lead[];
  semana: number;
  total: number;
  limite: number;
  agora: Date;
}) {
  const recentes = [...leads]
    .filter((l) => Number.isFinite(new Date(l.enteredAt).getTime()))
    .sort((a, b) => new Date(b.enteredAt).getTime() - new Date(a.enteredAt).getTime())
    .slice(0, limite);

  return (
    <section data-testid="inicio-quem-chegou" className="pn-card flex flex-col rounded-[var(--radius-control)]">
      <header className="flex min-h-12 items-center justify-between px-4">
        <h2 className="font-brand text-15 font-bold text-volt-950 lg:text-[16px]">Quem chegou</h2>
        {semana > 0 && (
          <span className="font-data flex items-center gap-2 text-13 tabular-nums text-volt-950">
            <span className="pn-ponto" aria-hidden="true" />+{semana} esta semana
          </span>
        )}
      </header>

      {recentes.length === 0 ? (
        <div className="px-4 pb-5">
          <p className="text-15 text-volt-950">Ninguém entrou ainda.</p>
          <p className="mt-1 text-13 text-slate-600">Compartilhe o convite da campanha e as fichas aparecem aqui.</p>
          <Link href="/painel/campanhas" className="mt-3 inline-flex min-h-11 items-center text-15 font-semibold text-cobalt-500">
            Compartilhar convite
          </Link>
        </div>
      ) : (
        <ul className="px-4">
          {recentes.map((lead, index) => {
            const hoje = agora.getTime() - new Date(lead.enteredAt).getTime() < DIA_MS;
            return (
              <li
                key={lead.id}
                className={cn("pn-ficha pn-ficha--56", index < 8 && "pn-entrada-lista")}
                style={index < 8 ? { ["--i" as string]: index } : undefined}
              >
                <span className={cn("pn-ficha__iniciais pn-ficha__iniciais--32", hoje && "pn-ficha__iniciais--hoje")} aria-hidden="true">
                  {iniciais(lead.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="pn-ficha__nome block truncate">{lead.name?.trim() || "Sem nome no WhatsApp"}</span>
                  <span className="pn-ficha__origem block truncate">
                    {lead.sourceGroup ? `pelo ${lead.sourceGroup}` : "entrou num grupo"}
                  </span>
                </span>
                <span className="font-data shrink-0 text-12 tabular-nums text-slate-600">{diaHoraCurto(lead.enteredAt, agora)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {total > 0 && (
        <Link
          href="/painel/contatos"
          className="mt-auto flex min-h-11 items-center px-4 text-13 font-semibold text-cobalt-500 lg:min-h-10"
        >
          Ver {total === 1 ? "o contato" : `os ${total.toLocaleString("pt-BR")} contatos`}
        </Link>
      )}
    </section>
  );
}
