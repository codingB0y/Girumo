"use client";

import { useState } from "react";
import { resolvePainelView } from "@/lib/painel-view";
import { DashboardSkeleton, LoadError } from "@/components/painel/home/dashboard-states";
import { FullDashboard } from "@/components/painel/home/full-dashboard";
import {
  OnboardingCampaign,
  OnboardingConnect,
  OnboardingShare,
} from "@/components/painel/home/onboarding/onboarding-views";
import { useDashboardData } from "@/components/painel/home/use-dashboard-data";

export default function PainelPage() {
  const { state, reload, applySettings } = useDashboardData();
  // O lojista pediu pra ver o painel sem terminar os passos do onboarding.
  const [skipOnboarding, setSkipOnboarding] = useState(false);

  if (state.status === "loading") return <DashboardSkeleton />;
  if (state.status === "error") return <LoadError onRetry={reload} />;

  const { data, partial } = state;
  const { groups, campanhas, links, leads, orders, session, settings } = data;
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
      orders={orders}
      settings={settings}
      isConnected={isConnected}
      partial={partial}
      onSettingsSaved={applySettings}
    />
  );
}
