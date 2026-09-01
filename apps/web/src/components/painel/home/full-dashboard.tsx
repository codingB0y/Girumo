"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Layers,
  Send,
  ShoppingBag,
  UserPlus,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Group } from "@/lib/mock-data";
import { PlaybookCard } from "@/components/painel/playbook-card";
import { CelebrationModal } from "@/components/painel/celebration-modal";
import { EmptyState } from "@/components/painel/empty-state";
import { ordersInMonth, revenueInMonth } from "@/lib/painel-metrics";
import { dayBR, dayBRAgo, dayBROf, horaBR, monthBR, monthBROf } from "@/lib/date-br";
import type { Activation } from "@/lib/onboarding-steps";
import { ActivationChecklist } from "./activation-checklist";
import { ActivityFeed } from "./activity-feed";
import { AutomationsSummary } from "./automations-summary";
import { UpcomingBroadcasts } from "./upcoming-broadcasts";
import { brl } from "./format";
import { MonthlyProgress } from "./monthly-progress";
import { QuickAction } from "./quick-action";
import { SectionLabel } from "./section-label";
import { WeeklyRhythm } from "./weekly-rhythm";
import type {
  Automation,
  Campanha,
  Disparo,
  Lead,
  Order,
  Schedule,
  TenantSettings,
  TrackedLink,
} from "./types";

export function FullDashboard({
  groups,
  campanhas,
  links,
  leads,
  orders,
  schedules,
  disparos,
  automations,
  settings,
  settingsOk,
  isConnected,
  partial,
  activation,
  onSettingsSaved,
  onDismissOnboarding,
  onOnboardingComplete,
}: {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
  orders: Order[];
  schedules: Schedule[];
  disparos: Disparo[];
  automations: Automation[];
  settings: TenantSettings;
  /** `/api/settings` respondeu. Ver DashboardData.settingsOk. */
  settingsOk: boolean;
  isConnected: boolean;
  /** Algum endpoint de números falhou — os totais podem estar incompletos. */
  partial: boolean;
  activation: Activation;
  onSettingsSaved: (next: TenantSettings) => void;
  onDismissOnboarding: () => void;
  onOnboardingComplete: () => void;
}) {
  const totalMembers = useMemo(() => groups.reduce((a, g) => a + (g.members ?? 0), 0), [groups]);
  const totalContatos = leads.length;
  const clientes = useMemo(() => leads.filter((l) => l.status === "comprou").length, [leads]);

  // Dia e mês de Brasília — ver @/lib/date-br. O lojista fecha o mês no fuso
  // dele, não no do servidor: um lead das 22h chega ao banco com carimbo UTC
  // do dia seguinte, e o prefixo cru o jogava para o dia (e o mês) errado.
  const today = dayBR();
  const yesterday = dayBRAgo(1);
  const month = monthBR();

  // Faturamento do mês corrente. Pedido sem `created_at` fica de fora do
  // recorte mensal em vez de inflar o número.
  const ordersThisMonth = useMemo(() => ordersInMonth(orders, month).length, [orders, month]);
  const revenueThisMonth = useMemo(() => revenueInMonth(orders, month), [orders, month]);

  const leadsToday = useMemo(
    () => leads.filter((l) => dayBROf(l.enteredAt) === today).length,
    [leads, today],
  );
  const leadsYesterday = useMemo(
    () => leads.filter((l) => dayBROf(l.enteredAt) === yesterday).length,
    [leads, yesterday],
  );
  const leadsThisMonth = useMemo(
    () => leads.filter((l) => monthBROf(l.enteredAt) === month).length,
    [leads, month],
  );

  // O que saiu hoje nos grupos. Um disparo sem `dispatchedAt` nunca rodou —
  // fica de fora em vez de contar como trabalho feito.
  const saiuHoje = useMemo(() => {
    const doDia = disparos.filter((d) => dayBROf(d.dispatchedAt) === today);
    return {
      grupos: doDia.reduce((a, d) => a + (d.sent ?? 0), 0),
      alvo: doDia.reduce((a, d) => a + (d.total ?? 0), 0),
      ultimo: doDia
        .map((d) => d.dispatchedAt)
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1),
    };
  }, [disparos, today]);

  // B3: de qual grupo veio mais dinheiro no mês. Exige um piso de amostra —
  // com um ou dois pedidos isto é ruído, não é o grupo que mais vende.
  const grupoQueMaisVendeu = useMemo(() => {
    const doMes = ordersInMonth(orders, month).filter((o) => o.group_name?.trim());
    if (doMes.length < 3) return null;
    const soma = new Map<string, number>();
    for (const o of doMes) {
      const g = o.group_name!.trim();
      soma.set(g, (soma.get(g) ?? 0) + (o.value ?? 0));
    }
    const [nome, valor] = [...soma.entries()].sort((a, b) => b[1] - a[1])[0];
    return { nome, valor };
  }, [orders, month]);

  const almostFull = useMemo(
    () => groups.filter((g) => g.capacity > 0 && g.members / g.capacity >= 0.9),
    [groups],
  );

  const deltaLeads = leadsToday - leadsYesterday;

  // O roteiro fica até o lojista fechar. Completar não some com ele sozinho:
  // sumir no instante em que o quinto passo acende esconderia justamente a
  // única tela que diz que deu certo.
  //
  // `settingsOk` é o que impede o card de reabrir sozinho: com `/api/settings`
  // fora, `onboardingDismissedAt` chega `null` por falta de resposta, não por
  // decisão do lojista — e tratar isso como "ainda não fechou" ressuscitava um
  // card que ele já tinha dispensado. Na dúvida, não insistir: quem de fato
  // nunca fechou volta a ver o roteiro no primeiro load que responder.
  const showChecklist = settingsOk && settings.onboardingDismissedAt == null;

  // Marco de ativação, gravado uma vez só (o servidor ignora reenvio).
  useEffect(() => {
    if (settingsOk && activation.complete && settings.onboardingCompletedAt == null) {
      onOnboardingComplete();
    }
  }, [settingsOk, activation.complete, settings.onboardingCompletedAt, onOnboardingComplete]);

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
  }[] = [
    {
      // Sem pedido registrado o card mostra "—", não "R$ 0,00". Pedido só nasce
      // por digitação manual em /painel/contatos, então o zero não é um fato
      // sobre as vendas do lojista — é a ausência de um dado que ninguém
      // preencheu, e estampá-lo em verde afirma que a loja não vendeu nada.
      label: "Faturamento no mês",
      value: ordersThisMonth === 0 ? "—" : brl.format(revenueThisMonth),
      sub:
        ordersThisMonth === 0
          ? "Registre um pedido pra acompanhar"
          : grupoQueMaisVendeu
            ? `Quem mais vendeu: ${grupoQueMaisVendeu.nome} — ${brl.format(grupoQueMaisVendeu.valor)}`
            : ordersThisMonth === 1
              ? "1 pedido registrado"
              : `${ordersThisMonth} pedidos registrados`,
      icon: ShoppingBag,
      href: ordersThisMonth === 0 ? "/painel/contatos" : "/painel/resultados",
    },
    {
      label: "Contatos captados",
      value: totalContatos.toLocaleString("pt-BR"),
      sub: clientes > 0 ? `${clientes.toLocaleString("pt-BR")} com pedido registrado` : undefined,
      icon: UserPlus,
      href: "/painel/contatos",
    },
    {
      // Este slot era "Cliques nas campanhas", um contador acumulado desde
      // sempre — sem recorte de período, ele não respondia nada que o lojista
      // perguntasse. Agora responde a única pergunta que ele faz ao abrir o
      // painel no meio do showroom: o robô trabalhou pra mim hoje?
      //
      // `grupos`, nunca "mensagens": `sent` conta grupos alcançados.
      label: "Saiu hoje",
      // "—" para ausência, igual ao card de Faturamento — o slot é tipografia
      // de dado tabular, e uma frase aqui destoa dos números ao lado.
      value: saiuHoje.alvo === 0 ? "—" : `${saiuHoje.grupos}/${saiuHoje.alvo}`,
      sub:
        saiuHoje.alvo === 0
          ? "Toque pra postar a novidade"
          : saiuHoje.ultimo
            ? `grupos · última às ${horaBR(saiuHoje.ultimo)}`
            : "grupos",
      icon: Send,
      href: "/painel/disparos",
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-8 sm:px-8">
      <CelebrationModal groups={groups} leads={leads} monthlyGoal={settings.monthlyGoalContacts} />

      {/* Header */}
      <header>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Início</h1>
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

      {showChecklist && (
        <ActivationChecklist activation={activation} onDismiss={onDismissOnboarding} />
      )}

      {/* O playbook dos 30 dias só entra depois que o roteiro de ativação
          fechou. Enquanto os dois apareciam juntos, eram dois cards de
          progresso empilhados acima do primeiro número da tela, com três
          passos repetidos — e o playbook não tem como ser fechado. */}
      {settings.onboardingCompletedAt != null && <PlaybookCard />}

      {/* Bento hero: Peça Escura + 3 KPIs claros */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* A Peça Escura — o norte do dia (Aurora VIP, uma por tela) */}
        <Link
          href="/painel/grupos"
          aria-label={`Ver grupos — ${totalMembers.toLocaleString("pt-BR")} membros nos seus grupos`}
          className="pn-aurora group relative flex min-h-[176px] flex-col justify-between overflow-hidden rounded-2xl p-6 lg:col-span-5"
        >
          <span className="font-data text-[11px] uppercase tracking-[0.08em] text-canvas-100/50">
            Membros nos seus grupos
          </span>
          <div>
            <p className="font-data text-[44px] font-medium leading-none tracking-[-0.03em] tabular-nums text-white">
              {totalMembers.toLocaleString("pt-BR")}
            </p>
            {/* Incondicional: o card "Desde ontem" só aparecia com movimento,
                e o dia parado é exatamente o que o lojista precisa ver. */}
            <p
              className={cn(
                "mt-3 flex items-center gap-1.5 font-data text-[13px] tabular-nums",
                leadsToday > 0 ? "text-sucesso" : "text-canvas-100/50",
              )}
            >
              {leadsToday > 0 && <ArrowUpRight className="h-3.5 w-3.5" />}
              {leadsToday > 0
                ? `+${leadsToday} ${leadsToday === 1 ? "contato" : "contatos"} hoje`
                : "Nenhum contato novo hoje"}
              {deltaLeads !== 0 && (
                <span className="text-canvas-100/45">
                  {deltaLeads > 0 ? `+${deltaLeads}` : deltaLeads} vs ontem
                </span>
              )}
            </p>
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
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Desde ontem + Meta do mês */}
      <section className="space-y-4">
        <SectionLabel n="01">Seu ritmo</SectionLabel>
        {/* Mesma fonte dos KPIs acima (os leads já carregados), pra que o
            gráfico não possa discordar do número que ele acompanha. */}
        <WeeklyRhythm leads={leads} />
        <MonthlyProgress
          kind="contacts"
          current={leadsThisMonth}
          goal={settings.monthlyGoalContacts}
          onSaved={(v) => onSettingsSaved({ ...settings, monthlyGoalContacts: v })}
        />
        <MonthlyProgress
          kind="revenue"
          current={revenueThisMonth}
          goal={settings.monthlyGoalRevenue}
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

      {/* O que sai sozinho: agendado + automático. Os dois cards são só leitura
          — agendar vive em Campanhas, ligar/desligar vive em Automações. */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel n="02">Próximos disparos</SectionLabel>
            <Link
              href="/painel/campanhas"
              className="font-data text-[11px] uppercase tracking-[0.08em] text-cobalt-500 transition hover:text-cobalt-700"
            >
              Agendar →
            </Link>
          </div>
          <UpcomingBroadcasts schedules={schedules} />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel n="03">Automações</SectionLabel>
            <Link
              href="/painel/automacoes"
              className="font-data text-[11px] uppercase tracking-[0.08em] text-cobalt-500 transition hover:text-cobalt-700"
            >
              Ver todas →
            </Link>
          </div>
          <AutomationsSummary automations={automations} />
        </div>
      </section>

      {/* Ações rápidas + Campanhas */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionLabel n="04">Ações rápidas</SectionLabel>
          {/* O gesto diário: chegou grade nova, posta em todos os grupos. Não
              tinha porta na Início nem na barra do celular. "Ver contatos" e
              "Ver resultados" saíram — os KPIs acima já levam aos dois. */}
          <div className="pn-card rounded-2xl p-2">
            <QuickAction href="/painel/disparos" icon={Send} label="Postar novidade nos grupos" />
            <QuickAction href="/painel/campanhas/nova" icon={Layers} label="Nova campanha" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionLabel n="05">Campanhas recentes</SectionLabel>
            <Link
              href="/painel/campanhas"
              className="font-data text-[11px] uppercase tracking-[0.08em] text-cobalt-500 transition hover:text-cobalt-700"
            >
              Ver todas →
            </Link>
          </div>
          {campanhas.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Nenhuma campanha ainda"
              description="A campanha gera um link. Quem clica entra direto no seu grupo."
              ctaLabel="Criar primeira campanha"
              ctaHref="/painel/campanhas/nova"
            />
          ) : (
            <div className="pn-card rounded-2xl p-2">
              {campanhas.slice(0, 4).map((c) => {
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
              })}
            </div>
          )}
        </div>
      </section>

      {/* Atividade — a linha do tempo da loja, montada a partir de leads,
          pedidos e disparos. Sem tabela de eventos nova. */}
      <section className="space-y-4">
        <SectionLabel n="06">Atividade</SectionLabel>
        <ActivityFeed leads={leads} orders={orders} disparos={disparos} />
      </section>
    </div>
  );
}
