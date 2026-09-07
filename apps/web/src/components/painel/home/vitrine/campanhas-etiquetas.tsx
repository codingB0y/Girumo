"use client";

import Link from "next/link";
import type { Campanha, TrackedLink } from "@/components/painel/home/types";
import type { Group } from "@/lib/mock-data";
import { vagasDaCampanha } from "@/lib/painel/inicio";

/**
 * Bloco 7 (12.3): três campanhas como etiquetas de preço, ordenadas por
 * lotação. Chip PRONTA em Canvas: Acid é só de AO VIVO e LOTOU.
 */
export function CampanhasEtiquetas({
  campanhas,
  grupos,
  links,
}: {
  campanhas: readonly Campanha[];
  grupos: readonly Group[];
  links: readonly TrackedLink[];
}) {
  if (campanhas.length === 0) {
    return (
      <div className="pn-card rounded-[var(--radius-control)] p-5">
        <p className="text-15 text-volt-950">Nenhuma campanha ainda.</p>
        <p className="mt-1 text-13 text-slate-600">A campanha gera o link; quem clica entra direto no grupo com vaga.</p>
        <Link href="/painel/campanhas/nova" className="mt-3 inline-flex min-h-11 items-center text-15 font-semibold text-cobalt-500">
          Criar campanha
        </Link>
      </div>
    );
  }

  const linhas = campanhas
    .map((c) => {
      const vagas = vagasDaCampanha(c.groupIds, grupos);
      const cliques = links.filter((l) => l.campaignName === c.name).reduce((a, l) => a + (l.clicks ?? 0), 0);
      return { c, vagas, cliques };
    })
    .sort((a, b) => b.vagas.lotacao - a.vagas.lotacao)
    .slice(0, 3);

  return (
    <div className="space-y-3">
      {linhas.map(({ c, vagas, cliques }) => {
        const cheia = vagas.capacidade > 0 && vagas.pessoas >= vagas.capacidade;
        return (
          <Link
            key={c.id}
            href={`/painel/campanhas/${c.slug ?? c.id}`}
            className="pn-etiqueta-preco block min-h-[80px] lg:min-h-[88px]"
          >
            <span className={cheia ? "pn-chip pn-chip--acid absolute right-4 top-4" : "pn-chip absolute right-4 top-4"}>
              {cheia ? "Lotou" : "Pronta"}
            </span>
            <span className="pn-etiqueta-preco__nome block pr-24 text-[16px] lg:text-20">{c.name}</span>
            <span className="font-data mt-1 flex items-center gap-3 text-13 text-slate-600">
              {c.slug && <span className="truncate text-cobalt-500">/r/{c.slug}</span>}
              <span className="shrink-0 tabular-nums">
                {cliques.toLocaleString("pt-BR")} {cliques === 1 ? "clique" : "cliques"}
              </span>
            </span>
            <span className="mt-2 flex items-center gap-3">
              <span className="pn-etiqueta-preco__barra flex-1" style={{ ["--p" as string]: Math.max(vagas.lotacao, 0.02) }} aria-hidden="true" />
              <span className="font-data shrink-0 text-13 tabular-nums text-volt-950">
                {vagas.pessoas.toLocaleString("pt-BR")} / {vagas.capacidade.toLocaleString("pt-BR")} vagas
              </span>
            </span>
          </Link>
        );
      })}
      <Link href="/painel/campanhas" className="inline-flex min-h-11 items-center text-13 font-semibold text-cobalt-500">
        Todas as campanhas
      </Link>
    </div>
  );
}
