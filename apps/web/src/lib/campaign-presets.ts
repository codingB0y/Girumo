/**
 * Presets de campanha por objetivo (P1.12) — usados pelo passo "Qual o objetivo?"
 * da nova campanha e pelo deep-link de reativação (P1.11).
 *
 * As `message` são sugestões pra o lojista COPIAR e postar junto do link de
 * captação nos grupos — NÃO são enviadas automaticamente (regra anti-ban: nenhum
 * template manda mensagem sozinho). Copy aprovada pelo Igor (29/jul).
 *
 * Módulo puro (sem I/O, sem server-only) — importável no cliente e testável.
 */

export type CampaignPresetId = "novidade" | "girar-estoque" | "reativacao" | "reposicao" | "zero";

export type CampaignPreset = {
  id: CampaignPresetId;
  /** Título do objetivo no seletor. */
  label: string;
  /** Uma linha explicando quando usar. */
  description: string;
  /** Nome sugerido da campanha; `{mes}` é trocado pelo mês atual. */
  nameTemplate: string;
  /** Mensagem-modelo pra postar com o link; null quando não há sugestão (Do zero). */
  message: string | null;
};

export const CAMPAIGN_PRESETS: CampaignPreset[] = [
  {
    id: "novidade",
    label: "Lançar novidade",
    description: "Chegou peça nova e você quer avisar os grupos.",
    nameTemplate: "Novidade {mes}",
    message:
      "Chegou novidade na loja! 🔥\nSeparei as peças novas e já tô mandando pra quem tá no grupo. Entra pelo link que eu passo tudo por lá — as primeiras costumam voar. 👇",
  },
  {
    id: "girar-estoque",
    label: "Girar estoque parado",
    description: "Peça encalhada com preço especial pra sair.",
    nameTemplate: "Saldão {mes}",
    message:
      "Bora girar o estoque! 🏷️\nSeparei umas peças com preço especial só pra quem tá no grupo. Dá uma olhada antes que acabe — entra pelo link. 👇",
  },
  {
    id: "reativacao",
    label: "Reativar grupos",
    description: "Grupos que esfriaram e precisam de um empurrão.",
    nameTemplate: "Reativação {mes}",
    message:
      "Faz um tempo que não aparece novidade por aqui! 👀\nTô voltando com tudo: peça nova e condição boa pra quem tá no grupo. Chega mais pelo link. 👇",
  },
  {
    id: "reposicao",
    label: "Semana de reposição",
    description: "Os queridinhos voltaram ao estoque.",
    nameTemplate: "Reposição {mes}",
    message:
      "Semana de reposição! ✅\nRepus os queridinhos que tinham esgotado. Quem tava esperando, corre — entra pelo link que eu mostro tudo. 👇",
  },
  {
    id: "zero",
    label: "Do zero",
    description: "Montar a campanha na mão, sem modelo.",
    nameTemplate: "",
    message: null,
  },
];

export function getCampaignPreset(id: string): CampaignPreset | undefined {
  return CAMPAIGN_PRESETS.find((p) => p.id === id);
}

/** Resolve o nome da campanha a partir do template do preset (`{mes}` → mês). */
export function resolvePresetName(preset: CampaignPreset, monthName: string): string {
  return preset.nameTemplate.replace("{mes}", monthName).trim();
}
