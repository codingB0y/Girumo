"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
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
  AlertTriangle,
  PartyPopper,
  Check,
  Pencil,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolvePainelView } from "@/lib/painel-view";

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

type TenantSettings = {
  monthlyGoalContacts: number | null;
  monthlyGoalRevenue: number | null;
};

type DashboardData = {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
  session: Session;
  settings: TenantSettings;
};

type StepInfo = { n: number; label: string; done?: boolean; active?: boolean };

// ---------- Helpers ----------

function getDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function getMonthStr(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/** Numeração editorial de seção — índice serif itálico + título Bricolage. */
function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-editorial text-[15px] italic text-ardosia">{n}</span>
      <span className="font-editorial text-[15px] italic text-ardosia">—</span>
      <h2 className="font-display text-[17px] font-bold tracking-[-0.01em] text-volt-950">{children}</h2>
    </div>
  );
}

// ---------- Data loading ----------

type FetchResult<T> = { ok: true; data: T } | { ok: false };

/** Busca que separa "veio vazio" de "não deu pra buscar". */
async function loadJson<T>(url: string): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false };
  }
}

function asArray<T>(result: FetchResult<unknown>): T[] {
  return result.ok && Array.isArray(result.data) ? (result.data as T[]) : [];
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  /** `partial` = carregou, mas algum endpoint só de números falhou. */
  | { status: "ready"; data: DashboardData; partial: boolean };

// ---------- Component ----------

export default function PainelPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  // O lojista pediu pra ver o painel sem terminar os passos do onboarding.
  const [skipOnboarding, setSkipOnboarding] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });

    const [groups, campanhas, links, leads, session, settings] = await Promise.all([
      loadJson<Group[]>("/api/groups"),
      loadJson<Campanha[]>("/api/campanhas"),
      loadJson<TrackedLink[]>("/api/links"),
      loadJson<Lead[]>("/api/leads"),
      loadJson<Session>("/api/session"),
      loadJson<TenantSettings>("/api/settings"),
    ]);

    // Estes três decidem entre onboarding e dashboard. Se algum falhar, não dá
    // pra decidir — e o palpite errado joga uma conta veterana de volta em
    // "Bem-vindo, conecte seu WhatsApp". Melhor admitir que não carregou.
    if (!session.ok || !campanhas.ok || !groups.ok) {
      setState({ status: "error" });
      return;
    }

    setState({
      status: "ready",
      partial: !links.ok || !leads.ok || !settings.ok,
      data: {
        groups: asArray<Group>(groups),
        campanhas: asArray<Campanha>(campanhas),
        links: asArray<TrackedLink>(links),
        leads: asArray<Lead>(leads),
        session: session.data ?? {},
        settings: {
          monthlyGoalContacts: (settings.ok ? settings.data?.monthlyGoalContacts : null) ?? null,
          monthlyGoalRevenue: (settings.ok ? settings.data?.monthlyGoalRevenue : null) ?? null,
        },
      },
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") return <DashboardSkeleton />;
  if (state.status === "error") return <LoadError onRetry={() => void load()} />;

  const { data, partial } = state;
  const { groups, campanhas, links, leads, session, settings } = data;
  const isConnected = session.live === true;

  // Regra de roteamento (e seus testes) em @/lib/painel-view.
  const view = resolvePainelView({
    isConnected,
    campaignCount: campanhas.length,
    totalMembers: groups.reduce((a, g) => a + (g.members ?? 0), 0),
    totalClicks: links.reduce((a, l) => a + (l.clicks ?? 0), 0),
    leadCount: leads.length,
    skipOnboarding,
  });

  if (view === "onboarding-connect") {
    return <OnboardingConnect />;
  }
  if (view === "onboarding-campaign") {
    return <OnboardingCampaign onSkip={() => setSkipOnboarding(true)} />;
  }
  if (view === "onboarding-share") {
    return (
      <OnboardingShare
        campanhas={campanhas}
        groupCount={groups.length}
        onSkip={() => setSkipOnboarding(true)}
      />
    );
  }

  // Full dashboard with real data
  return (
    <FullDashboard
      groups={groups}
      campanhas={campanhas}
      links={links}
      leads={leads}
      settings={settings}
      isConnected={isConnected}
      partial={partial}
      onSettingsSaved={(next) =>
        setState((s) => (s.status === "ready" ? { ...s, data: { ...s.data, settings: next } } : s))
      }
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-8 sm:px-8">
      <div className="pn-skeleton h-9 w-56 rounded-lg" style={{ ["--i" as string]: 0 }} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="pn-skeleton h-44 rounded-2xl lg:col-span-5" style={{ ["--i" as string]: 1 }} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:col-span-7">
          {[2, 3, 4].map((i) => (
            <div key={i} className="pn-skeleton h-44 rounded-2xl" style={{ ["--i" as string]: i }} />
          ))}
        </div>
      </div>
      <div className="pn-skeleton h-24 rounded-2xl" style={{ ["--i" as string]: 5 }} />
    </div>
  );
}

/**
 * Falha de carregamento. Antes, um /api/session fora do ar virava
 * `live: false` e a tela dizia "Bem-vindo à Girumo" pra quem já era cliente.
 */
function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
      <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Início</h1>

      <div className="pn-card mt-6 rounded-2xl p-8">
        <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:text-left">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-alerta/10 text-alerta">
            <AlertTriangle className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-volt-950">Não deu pra carregar seus dados</h2>
            <p className="mt-2 text-sm leading-relaxed text-aco/75">
              Seus grupos, campanhas e contatos continuam salvos — foi só esta tela que não conseguiu
              buscar. Tente de novo em instantes.
            </p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="hf-shine inline-flex items-center gap-2 rounded-[10px] bg-cobalt-500 px-6 py-3 text-sm font-medium text-white shadow-sm transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:brightness-110 active:scale-[0.97]"
          >
            <RefreshCw className="h-4 w-4" /> Tentar de novo
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Onboarding States ----------

function OnboardingShell({
  eyebrow,
  greeting,
  icon: Icon,
  iconClass,
  title,
  headline,
  body,
  ctaHref,
  ctaLabel,
  ctaIcon: CtaIcon,
  steps,
  footnote,
  onSkip,
}: {
  eyebrow: string;
  greeting: string;
  icon: LucideIcon;
  iconClass: string;
  title: string;
  headline: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
  ctaIcon: LucideIcon;
  steps: StepInfo[];
  /** Contexto do que já aconteceu — mostra ao lojista que o passo anterior deu certo. */
  footnote?: string;
  /** Saída pro painel completo. Sem isso, quem trava num passo não tem pra onde ir. */
  onSkip?: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
      <div>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">{title}</h1>
        <p className="font-editorial mt-1 text-[19px] italic text-ardosia">{greeting}</p>
        <p className="font-data mt-3 text-[11px] uppercase tracking-[0.08em] text-aco/55">{eyebrow}</p>
      </div>

      <div className="pn-card mt-6 rounded-2xl p-8">
        <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:text-left">
          <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl", iconClass)}>
            <Icon className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-volt-950">{headline}</h2>
            <p className="mt-2 text-sm leading-relaxed text-aco/75">{body}</p>
          </div>
          <Link
            href={ctaHref}
            className="hf-shine inline-flex items-center gap-2 rounded-[10px] bg-cobalt-500 px-6 py-3 text-sm font-medium text-white shadow-sm transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:brightness-110 active:scale-[0.97]"
          >
            <CtaIcon className="h-4 w-4" /> {ctaLabel}
          </Link>
        </div>

        {footnote && (
          <p className="mt-6 border-t border-volt-950/[0.06] pt-5 text-sm text-aco/70">{footnote}</p>
        )}

        <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <Step key={s.n} n={s.n} label={s.label} done={s.done} active={s.active} />
          ))}
        </ol>
      </div>

      {onSkip && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-aco/60 underline-offset-4 transition-colors duration-[160ms] hover:text-volt-950 hover:underline"
          >
            Ver o painel mesmo assim
          </button>
        </div>
      )}
    </div>
  );
}

function OnboardingConnect() {
  return (
    <OnboardingShell
      title="Bem-vindo à Girumo"
      greeting="Sua loja começa a crescer aqui."
      eyebrow="Vamos começar em 3 passos"
      icon={WifiOff}
      iconClass="bg-alerta/10 text-alerta"
      headline="Conecte seu WhatsApp"
      body="É o seu número de sempre. Leva 2 minutos, sem nada técnico. Depois disso seus grupos aparecem aqui automaticamente."
      ctaHref="/painel/conectar"
      ctaLabel="Conectar agora"
      ctaIcon={Wifi}
      steps={[
        { n: 1, label: "Conectar WhatsApp", active: true },
        { n: 2, label: "Criar campanha" },
        { n: 3, label: "Ver resultados" },
      ]}
    />
  );
}

function OnboardingCampaign({ onSkip }: { onSkip: () => void }) {
  return (
    <OnboardingShell
      onSkip={onSkip}
      title="Início"
      greeting="WhatsApp conectado. Agora é hora de encher os grupos."
      eyebrow="Crie sua primeira campanha"
      icon={Layers}
      iconClass="bg-cobalt-500/10 text-cobalt-500"
      headline="Crie sua primeira campanha"
      body="Uma campanha gera um link. Quem clica entra direto no seu grupo. Você enche os grupos no automático."
      ctaHref="/painel/campanhas/nova"
      ctaLabel="Nova campanha"
      ctaIcon={Layers}
      steps={[
        { n: 1, label: "Conectar WhatsApp", done: true },
        { n: 2, label: "Criar campanha", active: true },
        { n: 3, label: "Ver resultados" },
      ]}
    />
  );
}

function OnboardingShare({
  campanhas,
  groupCount,
  onSkip,
}: {
  campanhas: Campanha[];
  groupCount: number;
  onSkip: () => void;
}) {
  const first = campanhas[0];
  return (
    <OnboardingShell
      onSkip={onSkip}
      footnote={
        groupCount > 0
          ? `Já sincronizamos ${groupCount} ${groupCount === 1 ? "grupo" : "grupos"} do seu WhatsApp — é pra eles que o link leva.`
          : "Assim que alguém entrar por um link, seus grupos aparecem aqui."
      }
      title="Início"
      greeting="Falta um passo: leve gente pro seu link."
      eyebrow="Compartilhe o link da campanha"
      icon={Send}
      iconClass="bg-sucesso/10 text-sucesso"
      headline="Compartilhe o link da campanha"
      body="Mande o link pra clientes, poste nas redes ou coloque no seu cartão digital. Cada clique é um possível membro no grupo."
      ctaHref={`/painel/campanhas/${first?.slug ?? first?.id ?? ""}`}
      ctaLabel="Ver campanha"
      ctaIcon={Send}
      steps={[
        { n: 1, label: "Conectar WhatsApp", done: true },
        { n: 2, label: "Criar campanha", done: true },
        { n: 3, label: "Ver resultados", active: true },
      ]}
    />
  );
}

function Step({ n, label, active, done }: StepInfo) {
  return (
    <li className="flex items-center gap-2.5" aria-current={active ? "step" : undefined}>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-data text-sm font-medium tabular-nums",
          done
            ? "bg-sucesso/10 text-sucesso"
            : active
              ? "bg-cobalt-500 text-white shadow-sm"
              : "pn-poco text-aco/40",
        )}
      >
        {done ? <Check className="h-4 w-4" /> : n}
      </span>
      <span className={cn("text-sm", active ? "font-medium text-volt-950" : done ? "text-aco/70" : "text-aco/40")}>
        {label}
      </span>
    </li>
  );
}

// ---------- Full Dashboard ----------

function FullDashboard({
  groups,
  campanhas,
  links,
  leads,
  settings,
  isConnected,
  partial,
  onSettingsSaved,
}: {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
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

  const today = getDateStr(0);
  const yesterday = getDateStr(1);
  const month = getMonthStr();

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

  // KPIs claros (romaneio) — números sempre em mono tabular
  const kpis: { label: string; value: number | string; icon: LucideIcon; href: string }[] = [
    { label: "Cliques nas campanhas", value: totalClicks, icon: MousePointerClick, href: "/painel/campanhas" },
    { label: "Contatos captados", value: totalContatos, icon: UserPlus, href: "/painel/contatos" },
    { label: "Conversão clique→entrada", value: `${conversion}%`, icon: TrendingUp, href: "/painel/resultados" },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-8 sm:px-8">
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

      {/* Bento hero: Peça Escura + 3 KPIs claros */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* A Peça Escura — o norte do dia (Aurora VIP, uma por tela) */}
        <Link
          href="/painel/grupos"
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
              <p className="font-data mt-4 text-[32px] font-medium leading-none tracking-[-0.03em] tabular-nums text-volt-950">
                {typeof k.value === "number" ? k.value.toLocaleString("pt-BR") : k.value}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Desde ontem + Meta do mês */}
      <section className="space-y-4">
        <SectionLabel n="01">Seu ritmo</SectionLabel>
        <SinceYesterday leadsToday={leadsToday} deltaLeads={deltaLeads} />
        <MonthlyProgress
          current={leadsThisMonth}
          goal={monthlyGoal}
          isSuggested={!hasSavedGoal}
          onSaved={(v) => onSettingsSaved({ ...settings, monthlyGoalContacts: v })}
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

// ---------- Monthly Progress ----------

function MonthlyProgress({
  current,
  goal,
  isSuggested,
  onSaved,
}: {
  current: number;
  goal: number;
  isSuggested: boolean;
  onSaved: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goal));
  const [saving, setSaving] = useState(false);

  const pct = goal > 0 ? Math.min(Math.round((current / goal) * 100), 100) : 0;
  const achieved = current >= goal;

  async function handleSave() {
    const value = Math.round(Number(draft.replace(",", ".")));
    if (!value || value <= 0 || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyGoalContacts: value }),
      });
      if (res.ok) {
        onSaved(value);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pn-card rounded-2xl px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-cobalt-500" strokeWidth={1.75} />
          <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">
            Meta do mês{isSuggested && !editing ? " (meta sugerida)" : ""}
          </span>
        </div>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="font-data w-20 rounded-lg border border-volt-950/10 bg-poco px-2 py-1 text-right text-sm tabular-nums text-volt-950 outline-none focus:border-cobalt-500/50"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="font-data rounded-lg bg-cobalt-500 px-2.5 py-1 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "…" : "Salvar"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setDraft(String(goal));
              setEditing(true);
            }}
            className="group flex items-center gap-1.5"
          >
            <span
              className={cn(
                "font-data text-sm font-medium tabular-nums",
                achieved ? "text-sucesso" : "text-volt-950",
              )}
            >
              {current.toLocaleString("pt-BR")}/{goal.toLocaleString("pt-BR")} contatos
            </span>
            <Pencil className="h-3 w-3 text-aco/40 transition-colors group-hover:text-cobalt-500" strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="pn-poco mt-3 h-2 w-full overflow-hidden rounded-full">
        <div
          className={cn("pn-fill h-full w-full rounded-full", achieved ? "bg-sucesso" : "bg-cobalt-500")}
          style={{ transform: `scaleX(${Math.max(pct / 100, 0.02)})` }}
        />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-aco/60">
        {achieved ? (
          <>
            <PartyPopper className="h-3.5 w-3.5 text-sucesso" strokeWidth={1.75} />
            Meta atingida! Continue crescendo.
          </>
        ) : isSuggested ? (
          <>Faltam {(goal - current).toLocaleString("pt-BR")} contatos pra bater a meta sugerida — clique pra definir a sua.</>
        ) : (
          <>Faltam {(goal - current).toLocaleString("pt-BR")} contatos pra bater a meta.</>
        )}
      </p>
    </div>
  );
}

// ---------- Since Yesterday ----------

function SinceYesterday({ leadsToday, deltaLeads }: { leadsToday: number; deltaLeads: number }) {
  if (leadsToday === 0 && deltaLeads === 0) return null;

  const isUp = deltaLeads > 0;
  const isDown = deltaLeads < 0;

  return (
    <div className="pn-card rounded-2xl px-5 py-4">
      <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">Desde ontem</p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-cobalt-500" strokeWidth={1.75} />
          <span className="font-data text-lg font-medium tabular-nums text-volt-950">{leadsToday}</span>
          <span className="text-sm text-aco/70">
            {leadsToday === 1 ? "contato novo" : "contatos novos"} hoje
          </span>
        </div>

        {deltaLeads !== 0 && (
          <span
            className={cn(
              "pn-pop inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-data text-xs font-medium tabular-nums",
              isUp && "bg-sucesso/10 text-sucesso",
              isDown && "bg-alerta/10 text-alerta",
            )}
          >
            {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {isUp ? "+" : ""}
            {deltaLeads} vs ontem
          </span>
        )}

        {deltaLeads === 0 && leadsToday > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-poco px-2.5 py-1 font-data text-xs text-aco/60">
            <Minus className="h-3 w-3" />
            Igual a ontem
          </span>
        )}
      </div>
    </div>
  );
}

// ---------- Quick Action ----------

function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-[160ms] hover:bg-poco"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cobalt-500/10 text-cobalt-500">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="text-sm font-medium text-volt-950">{label}</span>
      <ArrowUpRight className="ml-auto h-4 w-4 text-aco/30 transition-transform duration-[160ms] ease-[var(--ease-fluxo)] group-hover:translate-x-0.5 group-hover:text-cobalt-500" />
    </Link>
  );
}
