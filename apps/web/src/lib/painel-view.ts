/**
 * Decide o que a tela inicial do painel mostra: um passo do onboarding ou o
 * dashboard completo.
 *
 * Vive fora do componente porque é a regra que já prendeu lojista: olhar só
 * para a contagem de membros dos grupos mantinha no passo 3 quem já tinha
 * cliques e contatos, mas cujos grupos ainda não haviam sincronizado.
 */

export type PainelView =
  | "onboarding-connect"
  | "onboarding-campaign"
  | "onboarding-share"
  | "dashboard";

export type PainelViewInput = {
  isConnected: boolean;
  campaignCount: number;
  totalMembers: number;
  totalClicks: number;
  leadCount: number;
  /** O lojista clicou em "Ver o painel mesmo assim". */
  skipOnboarding?: boolean;
};

export function resolvePainelView({
  isConnected,
  campaignCount,
  totalMembers,
  totalClicks,
  leadCount,
  skipOnboarding = false,
}: PainelViewInput): PainelView {
  if (skipOnboarding) return "dashboard";

  const hasCampaigns = campaignCount > 0;

  // Conta que já tem campanha nunca regride pro onboarding só por estar
  // desconectada — nesse caso o dashboard mostra o banner de reconexão.
  if (!isConnected) {
    return hasCampaigns ? "dashboard" : "onboarding-connect";
  }

  if (!hasCampaigns) return "onboarding-campaign";

  // Qualquer sinal de resultado conta como "já passou do onboarding".
  const hasActivity = totalMembers > 0 || totalClicks > 0 || leadCount > 0;
  return hasActivity ? "dashboard" : "onboarding-share";
}
