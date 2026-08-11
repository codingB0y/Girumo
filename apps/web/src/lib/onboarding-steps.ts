/**
 * Os passos de ativação do lojista — fonte única.
 *
 * Existiam três vocabulários para o mesmo funil: o signup dizia "Criar conta ·
 * Conectar WhatsApp · Primeiro disparo", o painel dizia "Conectar WhatsApp ·
 * Criar campanha · Ver resultados" e /painel/conectar dizia "Conectar número ·
 * Grupos entram · Primeira campanha". Três nomes para a mesma jornada, e um
 * deles ("primeiro disparo") pedia algo que a ativação nem exige.
 *
 * Aqui os passos são INDEPENDENTES, não uma cadeia. Isso é deliberado: no
 * modelo anterior o painel decidia UMA tela a partir do passo mais atrasado, e
 * quem tinha cliques e contatos mas cujos grupos ainda não haviam sincronizado
 * ficava preso em "compartilhe seu link" para sempre. Com itens independentes o
 * beco sem saída não tem como existir — cada linha acende sozinha.
 */

export type ActivationStepId = "connect" | "groups" | "campaign" | "share" | "lead";

export type ActivationStep = {
  id: ActivationStepId;
  /** Rótulo canônico. É este nome em toda superfície que fala de ativação. */
  label: string;
  /** O porquê, na voz do lojista. */
  hint: string;
  href: string;
  ctaLabel: string;
};

export const ACTIVATION_STEPS: readonly ActivationStep[] = [
  {
    id: "connect",
    label: "Conectar WhatsApp",
    hint: "Seu número de sempre. Leva 2 minutos, sem nada técnico.",
    href: "/painel/conectar",
    ctaLabel: "Conectar agora",
  },
  {
    id: "groups",
    label: "Sincronizar seus grupos",
    hint: "Assim que conectar, seus grupos aparecem aqui sozinhos.",
    href: "/painel/grupos",
    ctaLabel: "Ver grupos",
  },
  {
    id: "campaign",
    label: "Criar primeira campanha",
    hint: "A campanha gera um link. Quem clica entra direto no grupo.",
    href: "/painel/campanhas/nova",
    ctaLabel: "Nova campanha",
  },
  {
    id: "share",
    label: "Compartilhar o link",
    hint: "Mande pros clientes, poste nas redes. Cada clique é um possível membro.",
    href: "/painel/campanhas",
    ctaLabel: "Ver campanhas",
  },
  {
    id: "lead",
    label: "Primeiro contato captado",
    hint: "Quando alguém entra no grupo pelo seu link, ele aparece aqui.",
    href: "/painel/contatos",
    ctaLabel: "Ver contatos",
  },
] as const;

export type ActivationSignals = {
  isConnected: boolean;
  groupCount: number;
  campaignCount: number;
  totalClicks: number;
  leadCount: number;
};

export type ResolvedStep = ActivationStep & { done: boolean };

export type Activation = {
  steps: ResolvedStep[];
  doneCount: number;
  total: number;
  complete: boolean;
  /** Primeiro passo pendente — o que o card destaca. Null quando completo. */
  next: ResolvedStep | null;
};

/**
 * Cada passo lê o sinal mais fraco que o prova, e sinais fortes valem pelos
 * fracos: um contato captado só existe se alguém clicou num link de uma campanha
 * e entrou num grupo. Sem isso, um contador que ainda não sincronizou (grupos) ou
 * que é acumulado e pode zerar (cliques) deixaria um passo apagado embaixo de
 * outro já aceso — o lojista veria "4 de 5" sem nenhuma ação possível para fechar.
 *
 * `connect` é a exceção: reflete o estado AGORA, porque desconectar é real e
 * acionável. Quem já ativou não vê o card reabrir — quem controla isso é o
 * `onboarding_completed_at`, não este derivador.
 */
export function resolveActivation(signals: ActivationSignals): Activation {
  const { isConnected, groupCount, campaignCount, totalClicks, leadCount } = signals;

  const hasLead = leadCount > 0;
  const hasClick = totalClicks > 0 || hasLead;
  const hasCampaign = campaignCount > 0 || hasClick;
  const hasGroup = groupCount > 0 || hasLead;

  const doneById: Record<ActivationStepId, boolean> = {
    connect: isConnected,
    groups: hasGroup,
    campaign: hasCampaign,
    share: hasClick,
    lead: hasLead,
  };

  const steps: ResolvedStep[] = ACTIVATION_STEPS.map((s) => ({ ...s, done: doneById[s.id] }));
  const doneCount = steps.filter((s) => s.done).length;

  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length,
    next: steps.find((s) => !s.done) ?? null,
  };
}

/** Rótulo canônico de um passo, para quem só precisa do texto. */
export function activationLabel(id: ActivationStepId): string {
  const step = ACTIVATION_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Passo de ativação desconhecido: ${id}`);
  return step.label;
}
