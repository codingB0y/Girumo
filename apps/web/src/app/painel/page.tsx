"use client";

import { resolveActivation } from "@/lib/onboarding-steps";
import { DashboardSkeleton, LoadError } from "@/components/painel/home/dashboard-states";
import { FullDashboard } from "@/components/painel/home/full-dashboard";
import { useDashboardData } from "@/components/painel/home/use-dashboard-data";

export default function PainelPage() {
  const { state, reload, applySettings, dismissOnboarding, markOnboardingComplete } =
    useDashboardData();

  if (state.status === "loading") return <DashboardSkeleton />;
  if (state.status === "error") return <LoadError onRetry={reload} />;

  const { data, partial } = state;
  const { groups, campanhas, links, leads, orders, schedules, disparos, automations, session, settings } =
    data;
  const { settingsOk } = data;
  const isConnected = session.live === true;

  // Cinco passos derivados dos dados — regra e testes em @/lib/onboarding-steps.
  // Não decide mais QUAL tela mostrar: o dashboard é sempre a tela. A ativação
  // virou um card dentro dele.
  const activation = resolveActivation({
    isConnected,
    groupCount: groups.length,
    campaignCount: campanhas.length,
    totalClicks: links.reduce((a, l) => a + (l.clicks ?? 0), 0),
    leadCount: leads.length,
  });

  return (
    <FullDashboard
      groups={groups}
      campanhas={campanhas}
      links={links}
      leads={leads}
      orders={orders}
      schedules={schedules}
      disparos={disparos}
      automations={automations}
      settings={settings}
      settingsOk={settingsOk}
      isConnected={isConnected}
      partial={partial}
      activation={activation}
      onSettingsSaved={applySettings}
      onDismissOnboarding={dismissOnboarding}
      onOnboardingComplete={markOnboardingComplete}
    />
  );
}
