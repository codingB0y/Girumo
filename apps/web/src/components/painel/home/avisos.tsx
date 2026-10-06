"use client";

import Link from "next/link";
import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import type { TenantSettings } from "@/components/painel/home/types";
import type { Activation } from "@/lib/onboarding-steps";

/** O que a Vitrine e a Início "Ao vivo" mostram igual: carga parcial, número caído e o roteiro de ativação. */

export function AvisoParcial() {
  return (
    <p className="rounded-[var(--radius-control)] bg-aviso-fundo px-4 py-3 text-13 text-volt-950">
      Alguns números não carregaram e podem estar incompletos. Recarregue a página pra tentar de novo.
    </p>
  );
}

export function BannerDesconectado() {
  return (
    <Link
      href="/painel/conectar"
      className="flex items-center gap-3 rounded-[var(--radius-control)] border border-alerta bg-canvas-100 px-4 py-3"
    >
      <WifiOff className="h-5 w-5 shrink-0 text-alerta" strokeWidth={2} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-15 font-semibold text-volt-950">Seu WhatsApp está desconectado</span>
        <span className="block text-13 text-slate-600">Nada sai e ninguém entra até reconectar.</span>
      </span>
      <span className="shrink-0 text-13 font-semibold text-cobalt-500">Reconectar</span>
    </Link>
  );
}

/** A ativação completa é carimbada uma vez no servidor. */
export function useAtivacaoNoInicio({
  activation,
  settings,
  settingsOk,
  onOnboardingComplete,
}: {
  activation: Activation;
  settings: TenantSettings;
  settingsOk: boolean;
  onOnboardingComplete: () => void;
}) {
  useEffect(() => {
    if (settingsOk && activation.complete && settings.onboardingCompletedAt == null) onOnboardingComplete();
  }, [settingsOk, activation.complete, settings.onboardingCompletedAt, onOnboardingComplete]);
}
