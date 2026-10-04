"use client";

import { resolveActivation } from "@/lib/onboarding-steps";
import { DashboardSkeleton, LoadError } from "@/components/painel/home/dashboard-states";
import { InicioAoVivo } from "@/components/painel/home/ao-vivo/inicio-ao-vivo";
import { useDashboardData } from "@/components/painel/home/use-dashboard-data";

export default function PainelPage() {
  const { state, reload, atualizar, applySettings, dismissOnboarding, markOnboardingComplete } =
    useDashboardData();

  if (state.status === "loading") return <DashboardSkeleton />;
  if (state.status === "error") return <LoadError onRetry={reload} />;

  const { data, partial } = state;
  const { groups, campanhas, links, leads, orders, disparos, schedules, session, settings } = data;
  const { settingsOk, ordersOk, linksOk, disparosOk, schedulesOk, atividade, relampago, relampagoOk } = data;
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

  // Início "Ao vivo" (spec 2026-10-02) é a tela padrão. `?ao-vivo` dos links antigos é ignorado.
  return (
    <InicioAoVivo
      groups={groups}
      campanhas={campanhas}
      links={links}
      leads={leads}
      orders={orders}
      disparos={disparos}
      schedules={schedules}
      disparosOk={disparosOk}
      schedulesOk={schedulesOk}
      settings={settings}
      settingsOk={settingsOk}
      ordersOk={ordersOk}
      linksOk={linksOk}
      isConnected={isConnected}
      partial={partial}
      activation={activation}
      atividade={atividade}
      relampago={relampago}
      relampagoOk={relampagoOk}
      onAtualizar={atualizar}
      onSettingsSaved={applySettings}
      onDismissOnboarding={dismissOnboarding}
      onOnboardingComplete={markOnboardingComplete}
    />
  );
}
