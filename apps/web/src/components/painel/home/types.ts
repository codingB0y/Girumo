import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import type { Group } from "@/lib/mock-data";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import type { OfertaDaInicio, OfferRow, OfferTotalsRow } from "@/lib/stores/flash-offers";

export type Campanha = {
  id: string;
  name: string;
  groupIds: string[];
  slug?: string;
  /** "Lotou → abre outro" ligado. Já vem em /api/painel/inicio (`carregarCampanhas`). */
  autoGrow?: boolean;
};

export type TrackedLink = {
  slug: string;
  /** Vínculo com a campanha por ID (`carregarLinks` já devolve); `campaignName` só vale no link antigo. */
  campaignGroupId?: string | null;
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
 * O que `/api/disparos` devolve (`buildTenantDispatchList`).
 *
 * `sent` e `total` contam GRUPOS alcançados, não mensagens individuais — o
 * rótulo na tela precisa dizer "grupos", senão vira número inventado por outro
 * caminho.
 */
export type Disparo = TenantDispatchView;

/** Forma que `/api/schedules` devolve (mapeada do store Supabase). */
export type Schedule = {
  id: string;
  campaignName?: string;
  scheduledAt?: string;
  status?: string;
  recurrence?: string;
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

/** As ofertas Relâmpago da Início "Ao vivo" (`/api/painel/inicio`). */
export type RelampagoDaInicio = {
  abertas: OfertaDaInicio[];
  doDia: OfferRow[];
  totaisDoDia: OfferTotalsRow[];
};

export type DashboardData = {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
  orders: Order[];
  schedules: Schedule[];
  disparos: Disparo[];
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
  /** Falso = `orders` / `links` vieram vazios porque a busca falhou, não porque não há nada. */
  ordersOk: boolean;
  linksOk: boolean;
  /** Falso = `disparos` / `schedules` vieram vazios porque a busca falhou, não porque não há nada. */
  disparosOk: boolean;
  schedulesOk: boolean;
  /** Entradas, saídas e cliques da loja inteira (Início "Ao vivo"). Nulo = não carregou ou sem banco. */
  atividade: AtividadeDaCampanha | null;
  /** Ofertas Relâmpago no ar e do dia. Nulo = não carregou (veja `relampagoOk`) ou sem banco. */
  relampago: RelampagoDaInicio | null;
  /** Falso = `relampago` é nulo porque a busca falhou, não porque não há oferta. */
  relampagoOk: boolean;
};
