"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, MessageCircle, MoreHorizontal, Users, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";
import { PlanGate } from "@/components/painel/plan-gate";
import {
  buildCampaignGroupsOverview,
  type CampaignOperationalStatus,
} from "@/lib/campaign-groups-overview";
import type { Group } from "@/lib/mock-data";

type Campanha = {
  id: string;
  name: string;
  loja?: string;
  groupIds: string[];
  slug?: string;
  createdAt: string;
};
type TrackedLink = { slug: string; campaignName?: string; clicks: number };

const STATUS: Record<CampaignOperationalStatus, { label: string; pill: string }> = {
  ready: { label: "Pronta", pill: "bg-sucesso/10 text-sucesso" },
  needs_invites: { label: "Precisa de convites", pill: "bg-atencao/10 text-atencao" },
  full: { label: "Grupos cheios", pill: "bg-cobalt-500/10 text-cobalt-700" },
  empty: { label: "Sem grupos", pill: "bg-canvas-100 text-aco/60" },
};

const FILTERS: { value: "all" | CampaignOperationalStatus; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "ready", label: "Prontas" },
  { value: "needs_invites", label: "Sem convite" },
  { value: "full", label: "Cheias" },
  { value: "empty", label: "Sem grupos" },
];

export default function PainelCampanhas() {
  const router = useRouter();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | CampaignOperationalStatus>("all");
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      try {
        const [c, g, l] = await Promise.all([
          fetch("/api/campanhas").then((r) => r.json()).catch(() => []),
          fetch("/api/groups").then((r) => r.json()).catch(() => []),
          fetch("/api/links").then((r) => r.json()).catch(() => []),
        ]);
        setCampanhas(Array.isArray(c) ? c : []);
        setGroups(Array.isArray(g) ? g : []);
        setLinks(Array.isArray(l) ? l : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const clicksByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of links) {
      if (!l.campaignName) continue;
      m.set(l.campaignName, (m.get(l.campaignName) ?? 0) + (l.clicks ?? 0));
    }
    return m;
  }, [links]);

  const overviews = useMemo(
    () =>
      campanhas.map((c) =>
        buildCampaignGroupsOverview({
          campaign: c,
          groups,
          clicks: clicksByName.get(c.name) ?? 0,
        }),
      ),
    [campanhas, groups, clicksByName],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: overviews.length };
    for (const o of overviews) c[o.operationalStatus] = (c[o.operationalStatus] ?? 0) + 1;
    return c;
  }, [overviews]);

  const rows = useMemo(
    () =>
      overviews.filter(
        (o) =>
          (filter === "all" || o.operationalStatus === filter) &&
          o.campaign.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [overviews, filter, q],
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <header>
          <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Campanhas</h1>
          <p className="font-editorial mt-1 text-[19px] italic text-ardosia">
            Cada campanha é um link que enche seus grupos no automático.
          </p>
        </header>
        <Link
          href="/painel/campanhas/nova"
          className="group inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
        >
          <Plus className="h-4 w-4" /> Nova campanha
        </Link>
      </div>

      {/* Plan gate */}
      <PlanGate resource="campaigns" variant="card" />

      {/* Filtros + busca */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-volt-950/10 bg-papel p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "cursor-pointer rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors duration-[160ms]",
                filter === f.value ? "bg-volt-950 text-white" : "text-aco/70 hover:text-volt-950",
              )}
            >
              {f.label}
              <span className={cn("font-data ml-1.5 text-[11px] tabular-nums", filter === f.value ? "text-canvas-100/60" : "text-aco/40")}>
                {counts[f.value] ?? 0}
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
            aria-label="Pesquisar campanhas"
            className="w-full rounded-[10px] border border-volt-950/10 bg-poco py-2.5 pl-9 pr-3 text-sm text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] placeholder:text-aco/40 focus:border-cobalt-500/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)] sm:w-64"
          />
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pn-skeleton h-64 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="pn-card rounded-2xl px-5 py-16 text-center">
          <p className="font-editorial text-[22px] italic text-volt-950">
            {campanhas.length === 0 ? "Nenhuma campanha ainda." : "Nenhuma campanha aqui."}
          </p>
          <p className="mt-1 text-sm text-aco/60">
            {campanhas.length === 0 ? "Crie a primeira pra começar a captar." : "Ajuste o filtro ou a busca."}
          </p>
          {campanhas.length === 0 && (
            <Link
              href="/painel/campanhas/nova"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
            >
              <Plus className="h-4 w-4" /> Nova campanha
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((o) => {
            const c = o.campaign;
            const fill = o.fillPct;
            const quase = fill >= 85;
            const to = `/painel/campanhas/${c.slug ?? c.id}`;
            const masterUrl = c.slug ? `${origin}/r/${c.slug}` : "";
            return (
              <div
                key={c.id}
                onClick={() => router.push(to)}
                className="pn-card pn-card-hover group flex cursor-pointer flex-col rounded-2xl p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#25D366] text-white">
                      <MessageCircle className="h-6 w-6" />
                    </span>
                    <p className="font-display text-[15px] font-bold leading-tight text-volt-950">{c.name}</p>
                  </div>
                  <Link
                    href={to}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Abrir"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-aco/40 transition hover:bg-canvas-100 hover:text-volt-950"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Link>
                </div>

                {masterUrl ? (
                  <CopyLink url={masterUrl} className="mt-4" />
                ) : (
                  <p className="font-data mt-4 text-xs text-aco/40">link sendo gerado…</p>
                )}

                <div className="mt-3 flex items-center gap-3">
                  <div className="pn-poco h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className="pn-fill h-full w-full rounded-full"
                      style={{ transform: `scaleX(${Math.max(fill / 100, 0.02)})`, background: quase ? "#D99B2A" : "var(--color-cobalt-500)" }}
                    />
                  </div>
                  <span className={cn("font-data text-sm font-medium tabular-nums", quase ? "text-atencao" : "text-cobalt-500")}>
                    {fill}%
                  </span>
                </div>

                <dl className="mt-4 space-y-1.5">
                  <Stat label="Grupos" value={o.groupCount.toLocaleString("pt-BR")} />
                  <Stat label="Limite de membros" value={o.totalCapacity.toLocaleString("pt-BR")} />
                  <Stat label="Membros" value={o.totalMembers.toLocaleString("pt-BR")} strong />
                  <Stat label="Cliques" value={o.clicks.toLocaleString("pt-BR")} />
                </dl>

                <div className="mt-4 flex items-center justify-between">
                  <span className={cn("font-data rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider", STATUS[o.operationalStatus].pill)}>
                    {STATUS[o.operationalStatus].label}
                  </span>
                  <Link
                    href={to}
                    onClick={(e) => e.stopPropagation()}
                    className="font-data inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-cobalt-500 transition group-hover:gap-1.5"
                  >
                    <Users className="h-3.5 w-3.5" /> Ver grupos <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="font-data text-[11px] uppercase tracking-wider text-aco/55">{label}</dt>
      <dd className={cn("font-data text-sm tabular-nums", strong ? "font-semibold text-volt-950" : "text-aco")}>
        {value}
      </dd>
    </div>
  );
}
