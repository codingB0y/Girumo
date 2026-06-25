import type { CampaignOperationalStatus } from "@/lib/campaign-groups-overview";

export type CampaignNextStep = {
  title: string;
  description: string;
  actionLabel: string;
};

export function getCampaignNextStep(status: CampaignOperationalStatus): CampaignNextStep {
  if (status === "ready") {
    return {
      title: "Tudo pronto para divulgar",
      description: "Copie o link da campanha e envie para suas clientes.",
      actionLabel: "Copiar link",
    };
  }

  if (status === "empty") {
    return {
      title: "Escolha grupos para liberar o link",
      description: "Selecione os grupos que vao receber novas revendedoras.",
      actionLabel: "Escolher grupos",
    };
  }

  if (status === "needs_invites") {
    return {
      title: "Corrija convites antes de divulgar",
      description: "Algum grupo esta sem link de convite. Corrija isso para nao perder leads.",
      actionLabel: "Corrigir agora",
    };
  }

  return {
    title: "Todos os grupos estao cheios",
    description: "Adicione outro grupo para continuar recebendo novas revendedoras.",
    actionLabel: "Adicionar grupo",
  };
}
