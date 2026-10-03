"use client";

import { useCallback, useState } from "react";
import { CelebrationModal } from "@/components/painel/celebration-modal";
import { ActivationChecklist } from "@/components/painel/home/activation-checklist";
import { AvisoParcial, BannerDesconectado, useAtivacaoNaCasca } from "@/components/painel/home/avisos";
import type { Campanha, Disparo, Lead, Order, RelampagoDaInicio, Schedule, TenantSettings, TrackedLink } from "@/components/painel/home/types";
import type { Group } from "@/lib/mock-data";
import type { Activation } from "@/lib/onboarding-steps";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import { cn } from "@/lib/utils";
import { EntradasESaidas } from "./entradas-e-saidas";
import { FaixaDeStatus } from "./faixa-de-status";
import { MapaDosGrupos } from "./mapa-dos-grupos";
import { PostandoAgora } from "./postando-agora";
import { RelampagoAoVivo } from "./relampago-ao-vivo";
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
  schedules: Schedule[];
  disparosOk: boolean;
  schedulesOk: boolean;
  settings: TenantSettings;
  settingsOk: boolean;
  ordersOk: boolean;
  linksOk: boolean;
  isConnected: boolean;
  partial: boolean;
  activation: Activation;
  atividade: AtividadeDaCampanha | null;
  relampago: RelampagoDaInicio | null;
  relampagoOk: boolean;
  onAtualizar: () => void;
  onDismissOnboarding: () => void;
  onOnboardingComplete: () => void;
};

/**
 * Início "Ao vivo" (spec 2026-10-02, mockup F): a sala de controle da loja.
 * PR 1 a faixa, PR 2 o mapa, PR 3 o gráfico, PR 4 o postando agora, PR 5 a relâmpago.
 */
export function InicioAoVivo({
  groups,
  campanhas,
  links,
  leads,
  orders,
  disparos,
  schedules,
  disparosOk,
  schedulesOk,
  settings,
  settingsOk,
  ordersOk,
  linksOk,
  isConnected,
  partial,
  activation,
  atividade,
  relampago,
  relampagoOk,
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
  const noAr = relampagoOk && (relampago?.abertas.length ?? 0) > 0;
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
      {/*
        Três colunas a partir de 1400 px (Postando | mapa + gráfico | Relâmpago); de 1280 a 1400 duas, com a
        Relâmpago na coluna da esquerda, em cima do Postando se há oferta no ar; abaixo de 1280, empilhado
        (relâmpago no ar, Postando, mapa e gráfico). Sem oferta no ar a Relâmpago vai depois do Postando.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 min-[80rem]:grid-cols-[340px_minmax(0,1fr)] min-[80rem]:grid-rows-[auto_1fr] min-[80rem]:items-start min-[87.5rem]:grid-cols-[300px_minmax(0,1fr)_300px] min-[87.5rem]:grid-rows-none">
        <RelampagoAoVivo
          relampago={relampago}
          relampagoOk={relampagoOk}
          grupos={groups}
          agora={agora}
          onAtualizar={onAtualizar}
          className={cn(
            "min-[80rem]:col-start-1 min-[87.5rem]:col-start-3 min-[87.5rem]:row-start-1",
            noAr ? "min-[80rem]:row-start-1" : "order-1 min-[80rem]:order-none min-[80rem]:row-start-2 min-[87.5rem]:row-start-1",
          )}
        />
        <PostandoAgora
          posts={disparos}
          grupos={groups}
          agendamentos={schedules}
          agora={agora}
          disparosOk={disparosOk}
          schedulesOk={schedulesOk}
          totaisDoDia={relampago?.totaisDoDia ?? []}
          className={cn("min-[80rem]:col-start-1 min-[87.5rem]:row-start-1", noAr ? "min-[80rem]:row-start-2" : "min-[80rem]:row-start-1")}
        />
        <div
          className={cn(
            "min-w-0 space-y-6 min-[80rem]:col-start-2 min-[80rem]:row-span-2 min-[80rem]:row-start-1 min-[87.5rem]:row-span-1",
            !noAr && "order-2 min-[80rem]:order-none",
          )}
        >
          <MapaDosGrupos grupos={groups} campanhas={campanhas} atividade={atividade} />
          <EntradasESaidas atividade={atividade} posts={disparos} ofertasDoDia={relampago?.doDia ?? []} />
        </div>
      </div>
    </div>
  );
}
