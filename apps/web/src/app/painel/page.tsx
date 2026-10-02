"use client";

import { resolveActivation } from "@/lib/onboarding-steps";
import { DashboardSkeleton, LoadError } from "@/components/painel/home/dashboard-states";
import { InicioAoVivo } from "@/components/painel/home/ao-vivo/inicio-ao-vivo";
import { InicioVitrine } from "@/components/painel/home/vitrine/inicio-vitrine";
import { useDashboardData } from "@/components/painel/home/use-dashboard-data";

export default function PainelPage() {
  const { state, reload, atualizar, applySettings, dismissOnboarding, markOnboardingComplete } =
    useDashboardData();

  if (state.status === "loading") return <DashboardSkeleton />;
  if (state.status === "error") return <LoadError onRetry={reload} />;

  const { data, partial } = state;
  const { groups, campanhas, links, leads, orders, disparos, session, settings } = data;
  const { settingsOk, atividade } = data;
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

  // Início "Ao vivo" em construção atrás de ?ao-vivo (spec 2026-10-02). Lido aqui,
  // depois do skeleton: servidor e cliente renderizam o skeleton igual, então ler
  // window.location não quebra a hidratação nem pede fronteira de Suspense.
  if (new URLSearchParams(window.location.search).has("ao-vivo")) {
    return (
      <InicioAoVivo
        groups={groups}
        links={links}
        leads={leads}
        orders={orders}
        settings={settings}
        settingsOk={settingsOk}
        isConnected={isConnected}
        partial={partial}
        activation={activation}
        atividade={atividade}
        onAtualizar={atualizar}
        onDismissOnboarding={dismissOnboarding}
        onOnboardingComplete={markOnboardingComplete}
      />
    );
  }

  // Vitrine Aberta (PR 3b): mesma carga de dados, outra tela.
  return (
    <InicioVitrine
      groups={groups}
      campanhas={campanhas}
      links={links}
      leads={leads}
      orders={orders}
      disparos={disparos}
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
