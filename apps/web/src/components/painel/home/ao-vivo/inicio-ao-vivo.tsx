"use client";

import { useCallback, useState } from "react";
import { CelebrationModal } from "@/components/painel/celebration-modal";
import { ActivationChecklist } from "@/components/painel/home/activation-checklist";
import { AvisoParcial, BannerDesconectado, useAtivacaoNaCasca } from "@/components/painel/home/avisos";
import type { Campanha, Disparo, Lead, Order, TenantSettings, TrackedLink } from "@/components/painel/home/types";
import type { Group } from "@/lib/mock-data";
import type { Activation } from "@/lib/onboarding-steps";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import { EntradasESaidas } from "./entradas-e-saidas";
import { FaixaDeStatus } from "./faixa-de-status";
import { MapaDosGrupos } from "./mapa-dos-grupos";
import { useRecarga } from "./use-recarga";

const RECARGA_MS = 60_000;
const RELOGIO_MS = 30_000;

type Props = {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
  orders: Order[];
  disparos: Disparo[];
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
 * PR 1 a faixa, PR 2 o mapa, PR 3 o gráfico; postando agora e relâmpago entram nos PRs 4–5.
 */
export function InicioAoVivo({
  groups,
  campanhas,
  links,
  leads,
  orders,
  disparos,
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
  // Relógio próprio: a hora da faixa e o "atualizado há" andam mesmo quando a recarga falha ou não traz nada novo.
  const [agora, setAgora] = useState(() => new Date());
  const tick = useCallback(() => setAgora(new Date()), []);
  useRecarga(tick, RELOGIO_MS);
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
      <MapaDosGrupos grupos={groups} campanhas={campanhas} atividade={atividade} />
      <EntradasESaidas atividade={atividade} posts={disparos} />
    </div>
  );
}
