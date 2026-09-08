"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MousePointerClick, Users, ShoppingBag, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildCampaignGroupsOverview } from "@/lib/campaign-groups-overview";
import type { Group } from "@/lib/mock-data";
import { ResultadosVitrine } from "@/components/painel/resultados/vitrine/resultados-vitrine";
import { isPainelVitrineEnabled } from "@/lib/painel/flags";
import { buscarLista } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";

type Campanha = { id: string; name: string; groupIds: string[]; slug?: string; createdAt: string };
type TrackedLink = { campaignName?: string; clicks: number };
type Lead = { status: "novo" | "ativo" | "comprou" };
type Order = { id: string; value: number; group_name?: string | null; campaign_id?: string | null };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function PainelResultados() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cargaDasCampanhas, setCargaDasCampanhas] = useState<Carga>("carregando");
  const [cargaDosGrupos, setCargaDosGrupos] = useState<Carga>("carregando");
  const [cargaDosLinks, setCargaDosLinks] = useState<Carga>("carregando");
  const [cargaDosLeads, setCargaDosLeads] = useState<Carga>("carregando");
  const [cargaDosPedidos, setCargaDosPedidos] = useState<Carga>("carregando");

  /**
   * Uma carga por rota. Antes as cinco consultas caíam num `.catch(() => [])`
   * e o erro virava lista vazia — uma falha em /api/orders imprimia
   * "R$ 0,00" em Vendas desde o início, com cara de caixa fechado.
   */
  const carregar = useCallback(() => {
    void buscarLista<Campanha>("/api/campanhas", setCampanhas, setCargaDasCampanhas);
    void buscarLista<Group>("/api/groups", setGroups, setCargaDosGrupos);
    void buscarLista<TrackedLink>("/api/links", setLinks, setCargaDosLinks);
    void buscarLista<Lead>("/api/leads", setLeads, setCargaDosLeads);
    void buscarLista<Order>("/api/orders", setOrders, setCargaDosPedidos);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // A casca antiga só sabia esperar por todas — mantido para ela.
  const loading = [
    cargaDasCampanhas,
    cargaDosGrupos,
    cargaDosLinks,
    cargaDosLeads,
    cargaDosPedidos,
  ].some((c) => c === "carregando");

  const totalClicks = useMemo(() => links.reduce((a, l) => a + (l.clicks ?? 0), 0), [links]);
  const totalMembers = useMemo(() => groups.reduce((a, g) => a + (g.members ?? 0), 0), [groups]);
  const totalEntradas = leads.length;
  const clientes = useMemo(() => leads.filter((l) => l.status === "comprou").length, [leads]);
  // Conversão = entradas atribuídas (leads) ÷ cliques — totalMembers é estoque e pode passar de 100%.
  const conv = totalClicks > 0 ? Math.round((totalEntradas / totalClicks) * 100) : 0;

  const totalOrdersValue = useMemo(() => orders.reduce((a, o) => a + (o.value ?? 0), 0), [orders]);

  const ordersByGroup = useMemo(() => {
    const sums = new Map<string, number>();
    for (const o of orders) {
      const key = o.group_name?.trim() || "Sem grupo";
      sums.set(key, (sums.get(key) ?? 0) + (o.value ?? 0));
    }
    return [...sums.entries()].map(([group, total]) => ({ group, total })).sort((a, b) => b.total - a.total);
  }, [orders]);

  const revenueByCampaign = useMemo(() => {
    const nameById = new Map(campanhas.map((c) => [c.id, c.name]));
    const sums = new Map<string, number>();
    for (const o of orders) {
      const key = (o.campaign_id && nameById.get(o.campaign_id)) || "Sem origem";
      sums.set(key, (sums.get(key) ?? 0) + (o.value ?? 0));
    }
    return [...sums.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }, [orders, campanhas]);

  // "Atividade dos grupos" vivia aqui e foi removido: lia `g.engagement`, campo
  // que o servidor grava fixo em "medio". O donut era sempre 0 Ativos / N
  // Mornos / 0 Parados, e o CTA "Criar reativação" (que dependia de engagement
  // === "baixo") nunca renderizou uma vez. Mesmo motivo pelo qual a coluna
  // "Saúde" já tinha saído de /painel/grupos.

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
    { icon: Users, label: "Entraram no grupo", value: totalEntradas, pct: conv },
    { icon: ShoppingBag, label: "Viraram pedidos", value: orders.length, pct: totalClicks > 0 ? Math.round((orders.length / totalClicks) * 100) : 0 },
  ];

  // PR 11 da Vitrine Aberta: o quadro de giz do balcão. Cada número sabe de
  // qual consulta veio, e quem não respondeu mostra travessão em vez de zero.
  if (isPainelVitrineEnabled()) {
    return (
      <ResultadosVitrine
        links={{ cliques: totalClicks, carga: cargaDosLinks }}
        grupos={{ lista: groups, carga: cargaDosGrupos }}
        leads={{ entradas: totalEntradas, clientes, carga: cargaDosLeads }}
        pedidos={{ lista: orders, carga: cargaDosPedidos }}
        campanhas={{ lista: campanhas, carga: cargaDasCampanhas }}
        aoTentarDeNovo={carregar}
      />
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
        <div className="pn-skeleton h-10 w-56 rounded-lg" data-testid="painel-skeleton" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="pn-skeleton h-24 rounded-xl" data-testid="painel-skeleton" />)}</div>
        <div className="pn-skeleton h-72 rounded-xl" data-testid="painel-skeleton" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
      <header>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Resultados</h1>
        <p className="mt-1 text-[19px] text-ardosia">
          Do clique ao cliente — sem número inflado.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Cliques" value={totalClicks.toLocaleString("pt-BR")} />
        <Tile label="Membros" value={totalMembers.toLocaleString("pt-BR")} />
        <Tile label="Conversão clique→entrada" value={`${conv}%`} tone="cobalt" />
        <Tile label="Clientes" value={clientes.toLocaleString("pt-BR")} tone="sucesso" />
        {/* "Vendas registradas" aqui somava TODOS os pedidos, enquanto a Início
            mostra só o mês corrente com o mesmo verbo — o lojista via R$ 3.000
            num lugar e R$ 12.000 no outro sem nenhuma tela dizer o período. */}
        <Tile label="Vendas desde o início" value={brl.format(totalOrdersValue)} tone="sucesso" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Funil real */}
        <div className="pn-card rounded-xl p-6 lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-base font-bold text-volt-950">O caminho até a venda</h2>
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
                    <span className="flex items-center gap-2 text-sm text-aco"><Icon className="h-4 w-4 text-cobalt-500" strokeWidth={1.75} />{s.label}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="font-data text-lg font-medium tabular-nums text-volt-950">{s.value.toLocaleString("pt-BR")}</span>
                      {stepConv != null && <span className="font-data text-[11px] text-aco/45">{stepConv}% do passo</span>}
                    </span>
                  </div>
                  <div className="pn-poco h-3 w-full overflow-hidden rounded-full">
                    <div className="pn-fill h-full w-full rounded-full" style={{ transform: `scaleX(${Math.max(s.pct / 100, 0.04)})`, background: "var(--color-cobalt-500)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Membros por campanha */}
      <div className="pn-card rounded-xl p-6">
        <h2 className="font-display text-base font-bold text-volt-950">Membros por campanha</h2>
        {byCampaign.length === 0 ? (
          <p className="mt-4 text-[17px] text-ardosia">Crie campanhas pra ver o desempenho aqui.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {byCampaign.map((c) => (
              <div key={c.name} className="flex items-center gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cobalt-500/10 text-cobalt-500"><Megaphone className="h-4 w-4" strokeWidth={1.75} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm text-volt-950">{c.name}</p>
                    <p className="font-data text-sm font-medium tabular-nums text-volt-950">{c.members.toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="pn-poco mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                    <div className="pn-fill h-full w-full rounded-full bg-cobalt-500" style={{ transform: `scaleX(${Math.max(c.pct / 100, 0.02)})` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <Link href="/painel/campanhas" className="font-data mt-5 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] text-cobalt-500 transition-[gap] duration-[160ms] hover:gap-1.5">
          Ver campanhas →
        </Link>
      </div>

      {/* R$ por campanha */}
      <div className="pn-card rounded-xl p-6">
        <h2 className="font-display text-base font-bold text-volt-950">R$ por campanha</h2>
        {orders.length === 0 ? (
          <p className="mt-4 text-[17px] text-ardosia">
            Registre seus pedidos na tela Contatos pra ver o caminho completo até a venda.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {revenueByCampaign.map((c) => {
              const max = revenueByCampaign[0]?.total || 1;
              const pct = Math.round((c.total / max) * 100);
              return (
                <div key={c.name} className="flex items-center gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sucesso/10 text-sucesso">
                    <Megaphone className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm text-volt-950">{c.name}</p>
                      <p className="font-data text-sm font-medium tabular-nums text-volt-950">{brl.format(c.total)}</p>
                    </div>
                    <div className="pn-poco mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                      <div className="pn-fill h-full w-full rounded-full bg-sucesso" style={{ transform: `scaleX(${Math.max(pct / 100, 0.02)})` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* De onde veio cada venda */}
      <div className="pn-card rounded-xl p-6">
        <h2 className="font-display text-base font-bold text-volt-950">De onde veio cada venda</h2>
        {orders.length === 0 ? (
          <p className="mt-4 text-[17px] text-ardosia">
            Registre seus pedidos na tela Contatos pra ver o caminho completo até a venda.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {ordersByGroup.map((o) => {
              const max = ordersByGroup[0]?.total || 1;
              const pct = Math.round((o.total / max) * 100);
              return (
                <div key={o.group} className="flex items-center gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sucesso/10 text-sucesso">
                    <ShoppingBag className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm text-volt-950">{o.group}</p>
                      <p className="font-data text-sm font-medium tabular-nums text-volt-950">{brl.format(o.total)}</p>
                    </div>
                    <div className="pn-poco mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                      <div className="pn-fill h-full w-full rounded-full bg-sucesso" style={{ transform: `scaleX(${Math.max(pct / 100, 0.02)})` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "cobalt" | "sucesso" }) {
  return (
    <div className="pn-card rounded-xl p-4">
      <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">{label}</p>
      <p className={cn("font-data mt-2 text-[26px] font-medium tabular-nums tracking-[-0.02em]", tone === "cobalt" ? "text-cobalt-500" : tone === "sucesso" ? "text-sucesso" : "text-volt-950")}>
        {value}
      </p>
    </div>
  );
}
