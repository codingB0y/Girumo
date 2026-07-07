"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MousePointerClick, Users, ShoppingBag, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildCampaignGroupsOverview } from "@/lib/campaign-groups-overview";
import type { Group } from "@/lib/mock-data";

type Campanha = { id: string; name: string; groupIds: string[]; slug?: string; createdAt: string };
type TrackedLink = { campaignName?: string; clicks: number };
type Lead = { status: "novo" | "ativo" | "comprou" };

export default function PainelResultados() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, g, l, le] = await Promise.all([
          fetch("/api/campanhas").then((r) => r.json()).catch(() => []),
          fetch("/api/groups").then((r) => r.json()).catch(() => []),
          fetch("/api/links").then((r) => r.json()).catch(() => []),
          fetch("/api/leads").then((r) => r.json()).catch(() => []),
        ]);
        setCampanhas(Array.isArray(c) ? c : []);
        setGroups(Array.isArray(g) ? g : []);
        setLinks(Array.isArray(l) ? l : []);
        setLeads(Array.isArray(le) ? le : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalClicks = useMemo(() => links.reduce((a, l) => a + (l.clicks ?? 0), 0), [links]);
  const totalMembers = useMemo(() => groups.reduce((a, g) => a + (g.members ?? 0), 0), [groups]);
  const clientes = useMemo(() => leads.filter((l) => l.status === "comprou").length, [leads]);
  const conv = totalClicks > 0 ? Math.round((totalMembers / totalClicks) * 100) : 0;

  const activity = useMemo(() => {
    const c = { alto: 0, medio: 0, baixo: 0 };
    for (const g of groups) c[g.engagement] = (c[g.engagement] ?? 0) + 1;
    return [
      { label: "Ativos", count: c.alto, color: "#1E8E5A" },
      { label: "Mornos", count: c.medio, color: "#D99B2A" },
      { label: "Parados", count: c.baixo, color: "#D84040" },
    ];
  }, [groups]);
  const totalGroups = Math.max(groups.length, 1);

  const byCampaign = useMemo(() => {
    const clicksByName = new Map<string, number>();
    for (const l of links) if (l.campaignName) clicksByName.set(l.campaignName, (clicksByName.get(l.campaignName) ?? 0) + (l.clicks ?? 0));
    const rows = campanhas
      .map((c) => buildCampaignGroupsOverview({ campaign: c, groups, clicks: clicksByName.get(c.name) ?? 0 }))
      .sort((a, b) => b.totalMembers - a.totalMembers)
      .slice(0, 5);
    const max = Math.max(1, ...rows.map((r) => r.totalMembers));
    return rows.map((r) => ({ name: r.campaign.name, members: r.totalMembers, pct: Math.round((r.totalMembers / max) * 100) }));
  }, [campanhas, groups, links]);

  const funnel = [
    { icon: MousePointerClick, label: "Clicaram no link", value: totalClicks, pct: 100 },
    { icon: Users, label: "Entraram no grupo", value: totalMembers, pct: conv },
    { icon: ShoppingBag, label: "Viraram clientes", value: clientes, pct: totalClicks > 0 ? Math.round((clientes / totalClicks) * 100) : 0 },
  ];

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
        <div className="pn-skeleton h-10 w-56 rounded-lg" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="pn-skeleton h-24 rounded-2xl" />)}</div>
        <div className="pn-skeleton h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
      <header>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-breu">Resultados</h1>
        <p className="font-editorial mt-1 text-[19px] italic text-ardosia">
          Do clique ao cliente — sem número inflado.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Cliques" value={totalClicks.toLocaleString("pt-BR")} />
        <Tile label="Membros" value={totalMembers.toLocaleString("pt-BR")} />
        <Tile label="Conversão clique→membro" value={`${conv}%`} tone="iris" />
        <Tile label="Clientes" value={clientes.toLocaleString("pt-BR")} tone="sucesso" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Funil real */}
        <div className="pn-card rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-base font-bold text-breu">O caminho até a venda</h2>
            <span className="font-data rounded-full bg-poco px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-aco/55">real</span>
          </div>
          <div className="mt-6 space-y-3">
            {funnel.map((s, i) => {
              const Icon = s.icon;
              const prev = i > 0 ? funnel[i - 1].value : null;
              const stepConv = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
              return (
                <div key={s.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-aco"><Icon className="h-4 w-4 text-iris" strokeWidth={1.75} />{s.label}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="font-data text-lg font-medium tabular-nums text-breu">{s.value.toLocaleString("pt-BR")}</span>
                      {stepConv != null && <span className="font-data text-[11px] text-aco/45">{stepConv}% do passo</span>}
                    </span>
                  </div>
                  <div className="pn-poco h-3 w-full overflow-hidden rounded-full">
                    <div className="pn-fill h-full w-full rounded-full" style={{ transform: `scaleX(${Math.max(s.pct / 100, 0.04)})`, background: "#3D5AF1" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Atividade dos grupos */}
        <div className="pn-card rounded-2xl p-6">
          <h2 className="font-display text-base font-bold text-breu">Atividade dos grupos</h2>
          <div className="pn-poco mt-4 flex h-3 w-full overflow-hidden rounded-full">
            {activity.map((a) => (
              <div key={a.label} style={{ width: `${(a.count / totalGroups) * 100}%`, background: a.color }} />
            ))}
          </div>
          <div className="mt-4 space-y-2.5">
            {activity.map((a) => (
              <div key={a.label} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-aco">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                  {a.label}
                </span>
                <span className="font-data tabular-nums text-breu">{a.count} grupos</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Membros por campanha */}
      <div className="pn-card rounded-2xl p-6">
        <h2 className="font-display text-base font-bold text-breu">Membros por campanha</h2>
        {byCampaign.length === 0 ? (
          <p className="font-editorial mt-4 text-[17px] italic text-ardosia">Crie campanhas pra ver o desempenho aqui.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {byCampaign.map((c) => (
              <div key={c.name} className="flex items-center gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-iris/10 text-iris"><Megaphone className="h-4 w-4" strokeWidth={1.75} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm text-breu">{c.name}</p>
                    <p className="font-data text-sm font-medium tabular-nums text-breu">{c.members.toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="pn-poco mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                    <div className="pn-fill h-full w-full rounded-full bg-iris" style={{ transform: `scaleX(${Math.max(c.pct / 100, 0.02)})` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <Link href="/painel/campanhas" className="font-data mt-5 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] text-iris transition-[gap] duration-[160ms] hover:gap-1.5">
          Ver campanhas →
        </Link>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "iris" | "sucesso" }) {
  return (
    <div className="pn-card rounded-2xl p-4">
      <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">{label}</p>
      <p className={cn("font-data mt-2 text-[26px] font-medium tabular-nums tracking-[-0.02em]", tone === "iris" ? "text-iris" : tone === "sucesso" ? "text-sucesso" : "text-breu")}>
        {value}
      </p>
    </div>
  );
}
