"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Layers,
  MousePointerClick,
  ShoppingBag,
  TrendingUp,
  UserPlus,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import type { Group } from "@/lib/mock-data";
import { PlaybookCard } from "@/components/painel/playbook-card";
import { CelebrationModal } from "@/components/painel/celebration-modal";
import { ordersInMonth, revenueInMonth } from "@/lib/painel-metrics";
import { dailySeries } from "@/lib/sparkline";
import { brl, getDateStr, getMonthStr } from "./format";
import { MonthlyProgress } from "./monthly-progress";
import { QuickAction } from "./quick-action";
import { SectionLabel } from "./section-label";
import { SinceYesterday } from "./since-yesterday";
import { Sparkline } from "./sparkline";
import type { Campanha, Lead, Order, TenantSettings, TrackedLink } from "./types";

/** Janela dos sparklines dos KPIs. */
const SPARK_DAYS = 14;

export function FullDashboard({
  groups,
  campanhas,
  links,
  leads,
  orders,
  settings,
  isConnected,
  partial,
  onSettingsSaved,
}: {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
  orders: Order[];
  settings: TenantSettings;
  isConnected: boolean;
  /** Algum endpoint de números falhou — os totais podem estar incompletos. */
  partial: boolean;
  onSettingsSaved: (next: TenantSettings) => void;
}) {
  const totalMembers = useMemo(() => groups.reduce((a, g) => a + (g.members ?? 0), 0), [groups]);
  const totalClicks = useMemo(() => links.reduce((a, l) => a + (l.clicks ?? 0), 0), [links]);
  const totalContatos = leads.length;
  // Conversão = entradas atribuídas (leads capturados) ÷ cliques — nunca estoque de membros.
  const conversion = totalClicks > 0 ? Math.round((totalContatos / totalClicks) * 100) : 0;
  const clientes = useMemo(() => leads.filter((l) => l.status === "comprou").length, [leads]);

  const today = getDateStr(0);
  const yesterday = getDateStr(1);
  const month = getMonthStr();

  // Faturamento do mês corrente. Pedido sem `created_at` fica de fora do
  // recorte mensal em vez de inflar o número.
  const ordersThisMonth = useMemo(() => ordersInMonth(orders, month).length, [orders, month]);
  const revenueThisMonth = useMemo(() => revenueInMonth(orders, month), [orders, month]);

  // Tendência de 14 dias. Só para o que tem data por evento: pedidos e
  // contatos. Cliques não entram — `tracked_links.clicks` é um contador
  // acumulado, sem registro de quando cada clique aconteceu, e inventar uma
  // curva a partir do total seria desenhar ficção.
  const revenueSeries = useMemo(
    () => dailySeries(orders.map((o) => ({ date: o.created_at, value: o.value ?? 0 })), SPARK_DAYS),
    [orders],
  );
  const contactsSeries = useMemo(
    () => dailySeries(leads.map((l) => ({ date: l.enteredAt, value: 1 })), SPARK_DAYS),
    [leads],
  );

  const leadsToday = useMemo(
    () => leads.filter((l) => l.enteredAt?.startsWith(today)).length,
    [leads, today],
  );
  const leadsYesterday = useMemo(
    () => leads.filter((l) => l.enteredAt?.startsWith(yesterday)).length,
    [leads, yesterday],
  );
  const leadsThisMonth = useMemo(
    () => leads.filter((l) => l.enteredAt?.startsWith(month)).length,
    [leads, month],
  );

  const suggestedGoal = useMemo(() => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthStr = lastMonth.toISOString().slice(0, 7);
    const lastMonthLeads = leads.filter((l) => l.enteredAt?.startsWith(lastMonthStr)).length;
    return Math.max(lastMonthLeads > 0 ? Math.round(lastMonthLeads * 1.5) : 50, 20);
  }, [leads]);
  const hasSavedGoal = settings.monthlyGoalContacts != null;
  const monthlyGoal = hasSavedGoal ? (settings.monthlyGoalContacts as number) : suggestedGoal;

  const almostFull = useMemo(
    () => groups.filter((g) => g.capacity > 0 && g.members / g.capacity >= 0.9),
    [groups],
  );

  const deltaLeads = leadsToday - leadsYesterday;

  // KPIs claros (romaneio) — números sempre em mono tabular.
  // Faturamento vem primeiro: é o número que o lojista quer ver. Conversão
  // deixou de ser card próprio (é derivada de cliques e contatos) e virou o
  // rodapé do card de cliques, que é de onde ela sai.
  const kpis: {
    label: string;
    value: string;
    sub?: string;
    icon: LucideIcon;
    href: string;
    series?: number[];
    tone?: "cobalt" | "sucesso";
  }[] = [
    {
      label: "Faturamento no mês",
      value: brl.format(revenueThisMonth),
      sub: ordersThisMonth === 1 ? "1 pedido registrado" : `${ordersThisMonth} pedidos registrados`,
      icon: ShoppingBag,
      href: "/painel/resultados",
      series: revenueSeries,
      tone: "sucesso",
    },
    {
      label: "Contatos captados",
      value: totalContatos.toLocaleString("pt-BR"),
      sub: clientes > 0 ? `${clientes.toLocaleString("pt-BR")} já compraram` : undefined,
      icon: UserPlus,
      href: "/painel/contatos",
      series: contactsSeries,
      tone: "cobalt",
    },
    {
      // Sem sparkline: só temos o contador acumulado de cliques, sem data por
      // evento. Ver comentário nas séries acima.
      label: "Cliques nas campanhas",
      value: totalClicks.toLocaleString("pt-BR"),
      sub: totalClicks > 0 ? `${conversion}% viraram contato` : undefined,
      icon: MousePointerClick,
      href: "/painel/campanhas",
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-8 sm:px-8">
      <CelebrationModal groups={groups} leads={leads} monthlyGoal={settings.monthlyGoalContacts} />

      {/* Header */}
      <header>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Início</h1>
        <p className="font-editorial mt-1 text-[19px] italic text-ardosia">
          Bom te ver por aqui — a loja está no ar.
        </p>
      </header>

      {partial && (
        <p className="flex items-center gap-2 rounded-2xl border border-atencao/25 bg-atencao/[0.06] px-5 py-3 text-xs text-aco/75">
          <AlertTriangle className="h-4 w-4 shrink-0 text-atencao" strokeWidth={2} />
          Alguns números não carregaram e podem estar incompletos. Recarregue a página pra tentar de novo.
        </p>
      )}

      {!isConnected && (
        <Link
          href="/painel/conectar"
          className="flex items-center gap-3 rounded-2xl border border-alerta/25 bg-alerta/[0.06] px-5 py-4 transition hover:border-alerta/40"
        >
          <WifiOff className="h-5 w-5 shrink-0 text-alerta" strokeWidth={2} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-volt-950">Seu WhatsApp está desconectado</p>
            <p className="mt-0.5 text-xs text-aco/65">
              Suas campanhas não estão saindo e novos contatos não estão entrando nos grupos.
            </p>
          </div>
          <span className="font-data shrink-0 rounded-lg bg-alerta px-3 py-1.5 text-xs font-medium text-white">
            Reconectar
          </span>
        </Link>
      )}

      <PlaybookCard />

      {/* Bento hero: Peça Escura + 3 KPIs claros */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* A Peça Escura — o norte do dia (Aurora VIP, uma por tela) */}
        <Link
          href="/painel/grupos"
          aria-label={`Ver grupos — ${totalMembers.toLocaleString("pt-BR")} membros nos grupos VIP`}
          className="pn-aurora group relative flex min-h-[176px] flex-col justify-between overflow-hidden rounded-2xl p-6 lg:col-span-5"
        >
          <div className="flex items-center justify-between">
            <span className="font-data text-[11px] uppercase tracking-[0.08em] text-canvas-100/50">
              Membros nos grupos VIP
            </span>
            <span className="pn-etiqueta bg-white/10 text-canvas-100/80">ao vivo</span>
          </div>
          <div>
            <p className="font-data text-[44px] font-medium leading-none tracking-[-0.03em] tabular-nums text-white">
              {totalMembers.toLocaleString("pt-BR")}
            </p>
            {leadsToday > 0 && (
              <p className="mt-3 flex items-center gap-1.5 font-data text-[13px] tabular-nums text-sucesso">
                <ArrowUpRight className="h-3.5 w-3.5" />
                +{leadsToday} {leadsToday === 1 ? "contato" : "contatos"} hoje
              </p>
            )}
          </div>
        </Link>

        {/* 3 KPIs claros */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:col-span-7">
          {kpis.map((k) => (
            <Link
              key={k.label}
              href={k.href}
              className="pn-card pn-card-hover flex flex-col justify-between rounded-2xl p-5"
            >
              <div className="flex items-center gap-2">
                <k.icon className="h-4 w-4 text-cobalt-500" strokeWidth={1.75} />
                <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">{k.label}</span>
              </div>
              <div className="mt-4">
                <p className="font-data text-[32px] font-medium leading-none tracking-[-0.03em] tabular-nums text-volt-950">
                  {k.value}
                </p>
                {k.sub && <p className="mt-1.5 text-xs text-aco/55">{k.sub}</p>}
                {k.series && <Sparkline values={k.series} tone={k.tone ?? "cobalt"} />}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Desde ontem + Meta do mês */}
      <section className="space-y-4">
        <SectionLabel n="01">Seu ritmo</SectionLabel>
        <SinceYesterday leadsToday={leadsToday} deltaLeads={deltaLeads} />
        <MonthlyProgress
          kind="contacts"
          current={leadsThisMonth}
          goal={monthlyGoal}
          isSuggested={!hasSavedGoal}
          onSaved={(v) => onSettingsSaved({ ...settings, monthlyGoalContacts: v })}
        />
        <MonthlyProgress
          kind="revenue"
          current={revenueThisMonth}
          goal={settings.monthlyGoalRevenue}
          isSuggested={false}
          onSaved={(v) => onSettingsSaved({ ...settings, monthlyGoalRevenue: v })}
        />
      </section>

      {/* Alerta: grupos quase cheios */}
      {almostFull.length > 0 && (
        <div className="rounded-2xl border border-atencao/25 bg-atencao/[0.06] px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-medium text-volt-950">
            <AlertTriangle className="h-4 w-4 text-atencao" strokeWidth={2} />
            {almostFull.length} {almostFull.length === 1 ? "grupo está" : "grupos estão"} quase
            cheio{almostFull.length > 1 ? "s" : ""}
          </p>
          <p className="mt-1 pl-6 text-xs text-aco/65">
            {almostFull.map((g) => g.name).join(", ")} — crie novos grupos pra não perder captação.
          </p>
          <Link
            href="/painel/grupos"
            className="mt-2 inline-flex items-center gap-1 pl-6 text-xs font-medium text-atencao transition hover:text-volt-950"
          >
            Ver grupos →
          </Link>
        </div>
      )}

      {/* Ações rápidas + Campanhas */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionLabel n="02">Ações rápidas</SectionLabel>
          <div className="pn-card rounded-2xl p-2">
            <QuickAction href="/painel/campanhas/nova" icon={Layers} label="Nova campanha" />
            <QuickAction href="/painel/contatos" icon={UserPlus} label="Ver contatos" />
            <QuickAction href="/painel/resultados" icon={TrendingUp} label="Ver resultados" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel n="03">Campanhas ativas</SectionLabel>
            <Link
              href="/painel/campanhas"
              className="font-data text-[11px] uppercase tracking-[0.08em] text-cobalt-500 transition hover:text-cobalt-700"
            >
              Ver todas →
            </Link>
          </div>
          <div className="pn-card rounded-2xl p-2">
            {campanhas.length === 0 ? (
              <p className="px-3 py-6 text-sm text-aco/60">Nenhuma campanha ainda.</p>
            ) : (
              campanhas.slice(0, 4).map((c) => {
                const campClicks = links
                  .filter((l) => l.campaignName === c.name)
                  .reduce((a, l) => a + (l.clicks ?? 0), 0);
                return (
                  <Link
                    key={c.id}
                    href={`/painel/campanhas/${c.slug ?? c.id}`}
                    className="flex items-center justify-between rounded-xl px-3 py-3 transition-colors duration-[160ms] hover:bg-poco"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cobalt-500/10 text-cobalt-500">
                        <Layers className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-volt-950">{c.name}</p>
                        <p className="font-data text-[11px] text-aco/55">
                          {c.groupIds?.length ?? 0} grupo{(c.groupIds?.length ?? 0) !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <span className="font-data shrink-0 text-sm tabular-nums text-aco">
                      {campClicks.toLocaleString("pt-BR")} cliques
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
