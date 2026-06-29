"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, MessageCircle, MoreHorizontal, Users, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";

type Campaign = {
  slug: string;
  name: string;
  code: string;
  emoji?: string;
  grupos: number;
  limite: number;
  membros: number;
  cliques: number;
};

const CAMPAIGNS: Campaign[] = [
  { slug: "manychat-captacao", name: "ManyChat · Captação Grupos", code: "28966", grupos: 17, limite: 17000, membros: 6538, cliques: 9684 },
  { slug: "captacao-apenas-grupos", name: "Captação apenas Grupos", code: "28087", grupos: 60, limite: 60000, membros: 8107, cliques: 19348 },
  { slug: "saldao-mega-stock", name: "Saldão Mega Stock Atacado", code: "24227", emoji: "🛍️", grupos: 5, limite: 5000, membros: 4538, cliques: 56064 },
  { slug: "grupos-gerais-atual", name: "Grupos Gerais · Atual", code: "9059", grupos: 10, limite: 10000, membros: 6547, cliques: 14210 },
];

const FILTERS = ["Todas", "Enchendo", "Quase cheias"] as const;
type Filter = (typeof FILTERS)[number];

const fillOf = (c: Campaign) => (c.membros / c.limite) * 100;

export default function PainelCampanhas() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("Todas");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      Todas: CAMPAIGNS.length,
      Enchendo: CAMPAIGNS.filter((c) => fillOf(c) < 85).length,
      "Quase cheias": CAMPAIGNS.filter((c) => fillOf(c) >= 85).length,
    }),
    [],
  );

  const rows = useMemo(
    () =>
      CAMPAIGNS.filter((c) => {
        const f = fillOf(c);
        const byFilter =
          filter === "Todas" ? true : filter === "Enchendo" ? f < 85 : f >= 85;
        return byFilter && c.name.toLowerCase().includes(q.toLowerCase());
      }),
    [filter, q],
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Campanhas</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
            Cada campanha é um link que enche seus grupos no automático
          </p>
        </div>
        <Link
          href="/painel/campanhas/nova"
          className="group inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
        >
          <Plus className="h-4 w-4" /> Nova campanha
        </Link>
      </div>

      {/* Filtros + busca */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-breu/10 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
                filter === f ? "bg-breu text-white" : "text-aco/70 hover:text-breu",
              )}
            >
              {f}
              <span className={cn("font-data ml-1.5 text-[11px]", filter === f ? "text-bruma/60" : "text-aco/40")}>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aco/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar campanhas…"
            className="w-full rounded-xl border border-breu/10 bg-white py-2.5 pl-9 pr-3 text-sm text-breu outline-none transition placeholder:text-aco/40 focus:border-iris/40 focus:ring-4 focus:ring-iris/10 sm:w-64"
          />
        </div>
      </div>

      {/* Cards de campanha */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c) => {
          const fill = fillOf(c);
          const quase = fill >= 85;
          return (
            <div
              key={c.slug}
              onClick={() => router.push(`/painel/campanhas/${c.slug}`)}
              className="group flex cursor-pointer flex-col rounded-3xl border border-breu/[0.08] bg-white p-5 transition hover:-translate-y-0.5 hover:border-iris/30 hover:shadow-[0_12px_32px_-14px_rgba(11,13,26,0.18)]"
            >
              {/* topo */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Avatar emoji={c.emoji} />
                  <p className="font-display text-[15px] font-bold leading-tight text-breu">{c.name}</p>
                </div>
                <Link
                  href={`/painel/campanhas/${c.slug}`}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Ações"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-aco/40 transition hover:bg-bruma hover:text-breu"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Link>
              </div>

              {/* link */}
              <CopyLink url={`meugrupo.vip/c/${c.code}`} className="mt-4" />

              {/* preenchimento */}
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-bruma">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${fill}%`, background: quase ? "#D99B2A" : "#6A4BF0" }}
                    />
                  </div>
                  <span className={cn("font-data text-sm font-medium tabular-nums", quase ? "text-atencao" : "text-iris")}>
                    {fill.toFixed(2).replace(".", ",")}%
                  </span>
                </div>
              </div>

              {/* stats */}
              <dl className="mt-4 space-y-1.5">
                <Stat label="Grupos" value={c.grupos.toLocaleString("pt-BR")} />
                <Stat label="Limite de membros" value={c.limite.toLocaleString("pt-BR")} />
                <Stat label="Membros" value={c.membros.toLocaleString("pt-BR")} strong />
                <Stat label="Cliques" value={c.cliques.toLocaleString("pt-BR")} />
              </dl>

              {/* ação */}
              <Link
                href={`/painel/campanhas/${c.slug}`}
                onClick={(e) => e.stopPropagation()}
                className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-iris/10 py-2.5 text-sm font-medium text-iris transition group-hover:bg-iris group-hover:text-white"
              >
                <Users className="h-4 w-4" /> Ver grupos
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="rounded-3xl border border-breu/[0.08] bg-white px-5 py-16 text-center">
          <p className="font-display text-lg font-bold text-breu">Nenhuma campanha aqui</p>
          <p className="mt-1 text-sm text-aco/60">Ajuste o filtro ou crie uma nova.</p>
        </div>
      )}
    </div>
  );
}

function Avatar({ emoji }: { emoji?: string }) {
  if (emoji)
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-iris-claro to-iris-escuro text-xl">
        {emoji}
      </span>
    );
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#25D366] text-white">
      <MessageCircle className="h-6 w-6" />
    </span>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="font-data text-[11px] uppercase tracking-wider text-aco/55">{label}</dt>
      <dd className={cn("font-data text-sm tabular-nums", strong ? "font-semibold text-breu" : "text-aco")}>
        {value}
      </dd>
    </div>
  );
}
