import type { Group } from "@/lib/mock-data";

export type Campanha = {
  id: string;
  name: string;
  groupIds: string[];
  slug?: string;
};

export type TrackedLink = {
  slug: string;
  campaignName?: string;
  clicks: number;
};

export type Lead = {
  id: string;
  status: "novo" | "ativo" | "comprou";
  enteredAt: string;
  /** Vazio quando o participante veio como `@lid` sem telefone resolvido. */
  name?: string;
  sourceGroup?: string;
};

export type Order = {
  id: string;
  value: number;
  created_at?: string;
  /** Grupo de onde veio a venda. Vazio quando o pedido foi registrado solto. */
  group_name?: string | null;
};

/**
 * Subconjunto de `/api/disparos` que a Início usa.
 *
 * `sent` e `total` contam GRUPOS alcançados, não mensagens individuais — o
 * rótulo na tela precisa dizer "grupos", senão vira número inventado por outro
 * caminho.
 */
export type Disparo = {
  id: string;
  status: string;
  sent: number;
  total: number;
  dispatchedAt?: string;
};

/** Forma que `/api/schedules` devolve (mapeada do store Supabase). */
export type Schedule = {
  id: string;
  campaignName?: string;
  scheduledAt?: string;
  status?: string;
  recurrence?: string;
};

/** Subconjunto de `/api/automations` que a Início usa. */
export type Automation = {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  lastRunAt?: string | null;
};

export type Session = {
  live?: boolean;
  phone?: string | null;
};

export type TenantSettings = {
  monthlyGoalContacts: number | null;
  monthlyGoalRevenue: number | null;
  /** O lojista fechou o roteiro de ativação. */
  onboardingDismissedAt: string | null;
  /** Quando os 5 passos ficaram completos pela primeira vez. */
  onboardingCompletedAt: string | null;
};

export type DashboardData = {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
  orders: Order[];
  schedules: Schedule[];
  disparos: Disparo[];
  automations: Automation[];
  session: Session;
  settings: TenantSettings;
  /**
   * `/api/settings` respondeu. Falso = os campos de `settings` sao o DEFAULT,
   * nao o que o tenant salvou.
   *
   * Quem le `onboardingDismissedAt` precisa saber a diferenca entre "ninguem
   * fechou o card" e "nao consegui perguntar" — as duas chegavam aqui como
   * `null`, e o card do roteiro reabria sozinho a cada falha de rede.
   */
  settingsOk: boolean;
};
