"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  MousePointerClick,
  TrendingUp,
  Layers,
  Send,
  UserPlus,
  Wifi,
  WifiOff,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Types ----------

type Group = {
  id: string;
  name: string;
  members: number;
  capacity: number;
  engagement: string;
  inviteUrl?: string;
};

type Campanha = {
  id: string;
  name: string;
  groupIds: string[];
  slug?: string;
};

type TrackedLink = {
  slug: string;
  campaignName?: string;
  clicks: number;
};

type Lead = {
  id: string;
  status: "novo" | "ativo" | "comprou";
  enteredAt: string;
};

type Session = {
  live?: boolean;
  phone?: string | null;
};

type DashboardData = {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
  session: Session;
};

// ---------- Helpers ----------

function getDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function getMonthStr(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

// ---------- Component ----------

export default function PainelPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [groups, campanhas, links, leads, session] = await Promise.all([
          fetch("/api/groups").then((r) => r.json()).catch(() => []),
          fetch("/api/campanhas").then((r) => r.json()).catch(() => []),
          fetch("/api/links").then((r) => r.json()).catch(() => []),
          fetch("/api/leads").then((r) => r.json()).catch(() => []),
          fetch("/api/session").then((r) => r.json()).catch(() => ({})),
        ]);
        setData({
          groups: Array.isArray(groups) ? groups : [],
          campanhas: Array.isArray(campanhas) ? campanhas : [],
          links: Array.isArray(links) ? links : [],
          leads: Array.isArray(leads) ? leads : [],
          session: session ?? {},
        });
      } catch {
        setData({ groups: [], campanhas: [], links: [], leads: [], session: {} });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-white" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-3xl bg-white" />
      </div>
    );
  }

  if (!data) return null;

  const { groups, campanhas, links, leads, session } = data;
  const isConnected = session.live === true;
  const hasCampaigns = campanhas.length > 0;
  const hasMembers = groups.reduce((a, g) => a + (g.members ?? 0), 0) > 0;

  // Onboarding: progressive empty states
  if (!isConnected) {
    return <OnboardingConnect />;
  }
  if (!hasCampaigns) {
    return <OnboardingCampaign />;
  }
  if (!hasMembers) {
    return <OnboardingShare campanhas={campanhas} />;
  }

  // Full dashboard with real data
  return <FullDashboard groups={groups} campanhas={campanhas} links={links} leads={leads} />;
}

// ---------- Onboarding States ----------

function OnboardingConnect() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Bem-vindo ao HubFlow</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Vamos começar em 3 passos
        </p>
      </div>

      <div className="mt-8 rounded-3xl border border-breu/[0.08] bg-white p-8">
        <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:text-left">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-alerta/10">
            <WifiOff className="h-8 w-8 text-alerta" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-breu">Conecte seu WhatsApp</h2>
            <p className="mt-2 text-sm text-aco/70">
              É o seu número de sempre. Leva 2 minutos, sem nada técnico. Depois disso seus grupos
              aparecem aqui automaticamente.
            </p>
          </div>
          <Link
            href="/painel/conectar"
            className="inline-flex items-center gap-2 rounded-xl bg-iris px-6 py-3 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
          >
            <Wifi className="h-4 w-4" /> Conectar agora
          </Link>
        </div>

        {/* Stepper */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <Step n={1} label="Conectar WhatsApp" active />
          <Step n={2} label="Criar campanha" />
          <Step n={3} label="Ver resultados" />
        </div>
      </div>
    </div>
  );
}

function OnboardingCampaign() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Início</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          WhatsApp conectado — agora crie sua primeira campanha
        </p>
      </div>

      <div className="mt-8 rounded-3xl border border-breu/[0.08] bg-white p-8">
        <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:text-left">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-iris/10">
            <Layers className="h-8 w-8 text-iris" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-breu">Crie sua primeira campanha</h2>
            <p className="mt-2 text-sm text-aco/70">
              Uma campanha gera um link. Quem clica entra direto no seu grupo. Você enche os grupos
              no automático.
            </p>
          </div>
          <Link
            href="/painel/campanhas/nova"
            className="inline-flex items-center gap-2 rounded-xl bg-iris px-6 py-3 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
          >
            <Layers className="h-4 w-4" /> Nova campanha
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <Step n={1} label="Conectar WhatsApp" done />
          <Step n={2} label="Criar campanha" active />
          <Step n={3} label="Ver resultados" />
        </div>
      </div>
    </div>
  );
}

function OnboardingShare({ campanhas }: { campanhas: Campanha[] }) {
  const first = campanhas[0];
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Início</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Campanha criada — agora compartilhe o link
        </p>
      </div>

      <div className="mt-8 rounded-3xl border border-breu/[0.08] bg-white p-8">
        <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:text-left">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sucesso/10">
            <Send className="h-8 w-8 text-sucesso" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-breu">Compartilhe o link da campanha</h2>
            <p className="mt-2 text-sm text-aco/70">
              Mande o link pra clientes, poste nas redes ou coloque no seu cartão digital. Cada
              clique é um possível membro no grupo.
            </p>
          </div>
          <Link
            href={`/painel/campanhas/${first?.slug ?? first?.id ?? ""}`}
            className="inline-flex items-center gap-2 rounded-xl bg-iris px-6 py-3 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
          >
            <Send className="h-4 w-4" /> Ver campanha
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <Step n={1} label="Conectar WhatsApp" done />
          <Step n={2} label="Criar campanha" done />
          <Step n={3} label="Ver resultados" active />
        </div>
      </div>
    </div>
  );
}

function Step({ n, label, active, done }: { n: number; label: string; active?: boolean; done?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-data text-sm font-medium",
          done
            ? "bg-sucesso/10 text-sucesso"
            : active
              ? "bg-iris text-white shadow-iris"
              : "bg-bruma text-aco/40",
        )}
      >
        {done ? "✓" : n}
      </span>
      <span className={cn("text-sm", active ? "font-medium text-breu" : done ? "text-aco/70" : "text-aco/40")}>
        {label}
      </span>
    </div>
  );
}

// ---------- Full Dashboard ----------

function FullDashboard({
  groups,
  campanhas,
  links,
  leads,
}: {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
}) {
  const totalMembers = useMemo(() => groups.reduce((a, g) => a + (g.members ?? 0), 0), [groups]);
  const totalClicks = useMemo(() => links.reduce((a, l) => a + (l.clicks ?? 0), 0), [links]);
  const totalContatos = leads.length;
  const conversion = totalClicks > 0 ? Math.round((totalMembers / totalClicks) * 100) : 0;

  // Date helpers
  const today = getDateStr(0);
  const yesterday = getDateStr(1);
  const month = getMonthStr();

  // Leads per day
  const leadsToday = useMemo(
    () => leads.filter((l) => l.enteredAt?.startsWith(today)).length,
    [leads, today],
  );
  const leadsYesterday = useMemo(
    () => leads.filter((l) => l.enteredAt?.startsWith(yesterday)).length,
    [leads, yesterday],
  );

  // Leads this month
  const leadsThisMonth = useMemo(
    () => leads.filter((l) => l.enteredAt?.startsWith(month)).length,
    [leads, month],
  );

  // Monthly goal (auto-calculated: double last month or minimum 50)
  const monthlyGoal = useMemo(() => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthStr = lastMonth.toISOString().slice(0, 7);
    const lastMonthLeads = leads.filter((l) => l.enteredAt?.startsWith(lastMonthStr)).length;
    return Math.max(lastMonthLeads > 0 ? Math.round(lastMonthLeads * 1.5) : 50, 20);
  }, [leads]);

  // Groups almost full (>= 90%)
  const almostFull = useMemo(
    () => groups.filter((g) => g.capacity > 0 && g.members / g.capacity >= 0.9),
    [groups],
  );

  // Delta info
  const deltaLeads = leadsToday - leadsYesterday;

  const stats = [
    {
      label: "Membros nos grupos",
      value: totalMembers.toLocaleString("pt-BR"),
      icon: Users,
      href: "/painel/grupos",
    },
    {
      label: "Cliques nas campanhas",
      value: totalClicks.toLocaleString("pt-BR"),
      icon: MousePointerClick,
      href: "/painel/campanhas",
    },
    {
      label: "Contatos captados",
      value: totalContatos.toLocaleString("pt-BR"),
      icon: UserPlus,
      href: "/painel/contatos",
    },
    {
      label: "Conversão clique→grupo",
      value: `${conversion}%`,
      icon: TrendingUp,
      href: "/painel/resultados",
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Início</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Visão geral do seu negócio
        </p>
      </div>

      {/* Desde ontem */}
      <SinceYesterday leadsToday={leadsToday} deltaLeads={deltaLeads} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="group rounded-2xl border border-breu/[0.08] bg-white p-4 transition hover:-translate-y-0.5 hover:border-iris/30 hover:shadow-sm"
          >
            <div className="flex items-center gap-2">
              <s.icon className="h-4 w-4 text-iris" />
              <span className="font-data text-[10px] uppercase tracking-wider text-aco/55">
                {s.label}
              </span>
            </div>
            <p className="font-display mt-2 text-2xl font-extrabold tracking-tight text-breu">
              {s.value}
            </p>
          </Link>
        ))}
      </div>

      {/* Monthly progress */}
      <MonthlyProgress current={leadsThisMonth} goal={monthlyGoal} />

      {/* Alert: groups almost full */}
      {almostFull.length > 0 && (
        <div className="rounded-2xl border border-atencao/20 bg-atencao/[0.05] px-5 py-4">
          <p className="text-sm font-medium text-breu">
            ⚠️ {almostFull.length} {almostFull.length === 1 ? "grupo está" : "grupos estão"} quase
            cheio{almostFull.length > 1 ? "s" : ""}
          </p>
          <p className="mt-1 text-xs text-aco/60">
            {almostFull.map((g) => g.name).join(", ")} — crie novos grupos pra não perder captação.
          </p>
          <Link
            href="/painel/grupos"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-atencao transition hover:text-breu"
          >
            Ver grupos →
          </Link>
        </div>
      )}

      {/* Quick actions + Campaigns overview */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Quick Actions */}
        <div className="rounded-3xl border border-breu/[0.08] bg-white p-6">
          <h2 className="font-display text-base font-bold text-breu">Ações rápidas</h2>
          <div className="mt-4 grid gap-2">
            <QuickAction
              href="/painel/campanhas/nova"
              icon={Layers}
              label="Nova campanha"
              color="text-iris"
            />
            <QuickAction
              href="/painel/contatos"
              icon={UserPlus}
              label="Ver contatos"
              color="text-sucesso"
            />
            <QuickAction
              href="/painel/resultados"
              icon={TrendingUp}
              label="Ver resultados"
              color="text-iris"
            />
          </div>
        </div>

        {/* Campaigns summary */}
        <div className="rounded-3xl border border-breu/[0.08] bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-breu">Campanhas ativas</h2>
            <Link
              href="/painel/campanhas"
              className="font-data text-[11px] uppercase tracking-wider text-iris transition hover:text-iris-escuro"
            >
              Ver todas →
            </Link>
          </div>
          {campanhas.length === 0 ? (
            <p className="mt-4 text-sm text-aco/60">Nenhuma campanha ainda.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {campanhas.slice(0, 4).map((c) => {
                const campClicks = links
                  .filter((l) => l.campaignName === c.name)
                  .reduce((a, l) => a + (l.clicks ?? 0), 0);
                return (
                  <Link
                    key={c.id}
                    href={`/painel/campanhas/${c.slug ?? c.id}`}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:bg-bruma/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-iris/10 text-iris">
                        <Layers className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-breu">{c.name}</p>
                        <p className="font-data text-[11px] text-aco/55">
                          {c.groupIds?.length ?? 0} grupo{(c.groupIds?.length ?? 0) !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <span className="font-data text-sm tabular-nums text-aco">
                      {campClicks} cliques
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Monthly Progress ----------

function MonthlyProgress({ current, goal }: { current: number; goal: number }) {
  const pct = goal > 0 ? Math.min(Math.round((current / goal) * 100), 100) : 0;
  const achieved = current >= goal;

  return (
    <div className="rounded-2xl border border-breu/[0.08] bg-white px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-iris" />
          <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">
            Meta do mês
          </span>
        </div>
        <span className={cn(
          "font-data text-sm font-medium tabular-nums",
          achieved ? "text-sucesso" : "text-breu",
        )}>
          {current}/{goal} contatos
        </span>
      </div>
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-bruma">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(pct, 2)}%`,
            background: achieved ? "#1E8E5A" : pct >= 70 ? "#6A4BF0" : "#6A4BF0",
          }}
        />
      </div>
      <p className="mt-1.5 text-xs text-aco/55">
        {achieved
          ? "🎉 Meta atingida! Continue crescendo."
          : `Faltam ${goal - current} contatos pra bater a meta.`}
      </p>
    </div>
  );
}

// ---------- Since Yesterday ----------

function SinceYesterday({ leadsToday, deltaLeads }: { leadsToday: number; deltaLeads: number }) {
  // Don't show if no activity at all
  if (leadsToday === 0 && deltaLeads === 0) return null;

  const isUp = deltaLeads > 0;
  const isDown = deltaLeads < 0;

  return (
    <div className="rounded-2xl border border-breu/[0.08] bg-white px-5 py-4">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">Desde ontem</p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        {/* Leads today */}
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-iris" />
          <span className="font-display text-lg font-extrabold tabular-nums text-breu">
            {leadsToday}
          </span>
          <span className="text-sm text-aco/70">
            {leadsToday === 1 ? "contato novo" : "contatos novos"} hoje
          </span>
        </div>

        {/* Delta badge */}
        {deltaLeads !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-data text-xs font-medium",
              isUp && "bg-sucesso/10 text-sucesso",
              isDown && "bg-alerta/10 text-alerta",
            )}
          >
            {isUp ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {isUp ? "+" : ""}
            {deltaLeads} vs ontem
          </span>
        )}

        {deltaLeads === 0 && leadsToday > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-bruma px-2.5 py-1 font-data text-xs text-aco/60">
            <Minus className="h-3 w-3" />
            Igual a ontem
          </span>
        )}
      </div>
    </div>
  );
}

// ---------- Quick Action ----------

function QuickAction({
  href,
  icon: Icon,
  label,
  color,
}: {
  href: string;
  icon: typeof Layers;
  label: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-breu/[0.06] px-4 py-3 transition hover:border-iris/20 hover:bg-bruma/30"
    >
      <Icon className={cn("h-4 w-4", color)} />
      <span className="text-sm font-medium text-breu">{label}</span>
    </Link>
  );
}
