"use client";

import { CelebrationModal } from "@/components/painel/celebration-modal";
import { ActivationChecklist } from "@/components/painel/home/activation-checklist";
import { AvisoParcial, BannerDesconectado, useAtivacaoNaCasca } from "@/components/painel/home/avisos";
import type { Lead, Order, TenantSettings, TrackedLink } from "@/components/painel/home/types";
import type { Group } from "@/lib/mock-data";
import type { Activation } from "@/lib/onboarding-steps";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import { FaixaDeStatus } from "./faixa-de-status";
import { useRecarga } from "./use-recarga";

const RECARGA_MS = 60_000;

type Props = {
  groups: Group[];
  links: TrackedLink[];
  leads: Lead[];
  orders: Order[];
  settings: TenantSettings;
  settingsOk: boolean;
  ordersOk: boolean;
  linksOk: boolean;
  isConnected: boolean;
  partial: boolean;
  activation: Activation;
  atividade: AtividadeDaCampanha | null;
  onAtualizar: () => void;
  onDismissOnboarding: () => void;
  onOnboardingComplete: () => void;
};

/**
 * Início "Ao vivo" (spec 2026-10-02, mockup F): a sala de controle da loja.
 * PR 1 = a faixa de status; mapa, postando agora e relâmpago entram nos PRs 2–5.
 */
export function InicioAoVivo({
  groups,
  links,
  leads,
  orders,
  settings,
  settingsOk,
  ordersOk,
  linksOk,
  isConnected,
  partial,
  activation,
  atividade,
  onAtualizar,
  onDismissOnboarding,
  onOnboardingComplete,
}: Props) {
  // Sem memo: a hora da faixa e o "atualizado há" andam a cada recarga.
  const agora = new Date();
  useAtivacaoNaCasca({ activation, settings, settingsOk, onOnboardingComplete });
  useRecarga(onAtualizar, RECARGA_MS);
  const mostrarChecklist = settingsOk && settings.onboardingDismissedAt == null && !activation.complete;

  return (
    <div data-testid="inicio-ao-vivo" className="space-y-6 px-4 py-5 lg:px-8 lg:py-6">
      <CelebrationModal groups={groups} leads={leads} monthlyGoal={settings.monthlyGoalContacts} />
      <h1 className="sr-only">Início ao vivo</h1>
      {!isConnected && <BannerDesconectado />}
      {partial && <AvisoParcial />}
      {mostrarChecklist && (
        <div className="lg:hidden">
          <ActivationChecklist activation={activation} onDismiss={onDismissOnboarding} />
        </div>
      )}
      <FaixaDeStatus
        atividade={atividade}
        links={links}
        orders={orders}
        metaDoMes={settings.monthlyGoalRevenue}
        agora={agora}
        ordersOk={ordersOk}
        linksOk={linksOk}
        settingsOk={settingsOk}
      />
    </div>
  );
}
