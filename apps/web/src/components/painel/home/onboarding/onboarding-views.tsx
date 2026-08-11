"use client";

import { Layers, Send, Wifi, WifiOff } from "lucide-react";
import { OnboardingShell } from "./onboarding-shell";
import type { Campanha } from "../types";

export function OnboardingConnect() {
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

export function OnboardingCampaign({ onSkip }: { onSkip: () => void }) {
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

export function OnboardingShare({
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
