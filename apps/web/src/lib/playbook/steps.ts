/**
 * Playbook "Primeiros 30 dias" (P1.8) — definição dos passos.
 *
 * Módulo puro (sem I/O, sem server-only). A ORDEM do array é a prioridade do
 * "próximo passo" em destaque no card. `auto:true` = detectado dos dados;
 * `auto:false` (só `share_link`) = o lojista marca na mão.
 *
 * Copy no vocabulário do nicho ("estilo O Balcão") — sujeita a ajuste do Igor.
 */

export type PlaybookStepKey =
  | "connect"
  | "first_campaign"
  | "share_link"
  | "first_broadcast"
  | "welcome_automation"
  | "leads_50"
  | "first_order"
  | "monthly_goal";

export type PlaybookStep = {
  key: PlaybookStepKey;
  title: string;
  description: string;
  /** true = marca sozinho quando a condição vira verdade; false = manual. */
  auto: boolean;
  ctaHref: string;
  ctaLabel: string;
};

export const PLAYBOOK_STEPS: PlaybookStep[] = [
  {
    key: "connect",
    title: "Conectar o WhatsApp",
    description: "Ligue a loja na tomada — sem conexão, nada sai.",
    auto: true,
    ctaHref: "/painel/conectar",
    ctaLabel: "Conectar",
  },
  {
    key: "first_campaign",
    title: "Criar a 1ª campanha",
    description: "Monte o grupo que captura contato pelo link.",
    auto: true,
    ctaHref: "/painel/campanhas",
    ctaLabel: "Criar campanha",
  },
  {
    key: "share_link",
    title: "Divulgar o link em 3 lugares",
    description: "Bio do Insta, etiqueta da sacola e status do WhatsApp.",
    auto: false,
    ctaHref: "/painel/campanhas",
    ctaLabel: "Ver meu link",
  },
  {
    key: "first_broadcast",
    title: "Postar a 1ª novidade nos grupos",
    description: "A primeira grade que chega vira post nos grupos.",
    auto: true,
    ctaHref: "/painel/disparos",
    ctaLabel: "Postar novidade",
  },
  {
    key: "welcome_automation",
    title: "Ativar boas-vindas de revendedor",
    description: "Quem entra recebe as regras do balcão sozinho.",
    auto: true,
    ctaHref: "/painel/automacoes",
    ctaLabel: "Ativar boas-vindas",
  },
  {
    key: "leads_50",
    title: "Primeiros 50 contatos via link",
    description: "50 revendedores captados pelo link da campanha.",
    auto: true,
    ctaHref: "/painel/contatos",
    ctaLabel: "Ver contatos",
  },
  {
    key: "first_order",
    title: "Registrar o 1º pedido",
    description: "Anote a primeira venda pra fechar o ciclo.",
    auto: true,
    ctaHref: "/painel/resultados",
    ctaLabel: "Registrar pedido",
  },
  {
    key: "monthly_goal",
    title: "Definir a meta do mês",
    description: "Quantos contatos você quer fechar esse mês.",
    auto: true,
    ctaHref: "/painel/configuracoes",
    ctaLabel: "Definir meta",
  },
];

export const PLAYBOOK_TOTAL = PLAYBOOK_STEPS.length;

export const MANUAL_STEP_KEYS: PlaybookStepKey[] = PLAYBOOK_STEPS.filter((s) => !s.auto).map((s) => s.key);

export function isManualStepKey(key: string): key is PlaybookStepKey {
  return (MANUAL_STEP_KEYS as string[]).includes(key);
}
