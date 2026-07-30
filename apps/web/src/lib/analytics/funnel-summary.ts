/**
 * Lógica PURA do funil de ativação — sem I/O e sem `server-only`, então roda em
 * Server Components, na camada de dados e em testes unitários (tsx --test não
 * suporta o import "server-only").
 */

export type FunnelEvent =
  | "signup"
  | "qr_connected"
  | "first_group_synced"
  | "first_dispatch"
  | "first_schedule"
  | "first_campaign_created"
  | "first_lead_captured"
  | "leads_50"
  | "first_order"
  | "goal_set"
  | "trial_started"
  | "payment_completed"
  | "referral_sent";

/**
 * Caminho linear de ativação (ordenado). `goal_set` fica FORA porque definir meta
 * não é um passo sequencial do funil — é mostrado à parte como indicador.
 */
export const ACTIVATION_MILESTONES: { event: FunnelEvent; label: string }[] = [
  { event: "signup", label: "Signup" },
  { event: "qr_connected", label: "Conectou" },
  { event: "first_campaign_created", label: "1ª campanha" },
  { event: "first_lead_captured", label: "1º lead" },
  { event: "leads_50", label: "50 leads" },
  { event: "first_order", label: "1º pedido" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const STUCK_THRESHOLD_DAYS = 5;

export type TenantFunnelRow = {
  tenantId: string;
  name: string;
  createdAt: string;
  /** event_name → occurred_at (ISO) da PRIMEIRA ocorrência. */
  milestones: Partial<Record<FunnelEvent, string>>;
};

export type TenantFunnelSummary = TenantFunnelRow & {
  ageDays: number;
  reachedCount: number;
  furthest: FunnelEvent | null;
  furthestLabel: string;
  /** Dias desde o marco mais recente (baseline = criação da conta). */
  daysSinceProgress: number;
  /** true se atingiu o marco terminal (first_order). */
  activated: boolean;
  /** Parado >5 dias no mesmo marco e ainda não ativado — o refund de amanhã. */
  isStuck: boolean;
  goalSet: boolean;
};

/**
 * Resumo derivado por tenant — puro e testável. `now` em epoch ms.
 */
export function summarizeTenantFunnel(row: TenantFunnelRow, now: number): TenantFunnelSummary {
  const createdMs = Date.parse(row.createdAt);
  const ageDays = Math.max(0, Math.floor((now - createdMs) / DAY_MS));

  let reachedCount = 0;
  let furthest: FunnelEvent | null = null;
  let furthestLabel = "—";
  let lastProgressMs = createdMs;

  for (const m of ACTIVATION_MILESTONES) {
    const at = row.milestones[m.event];
    if (!at) continue;
    reachedCount++;
    furthest = m.event;
    furthestLabel = m.label;
    const atMs = Date.parse(at);
    if (Number.isFinite(atMs) && atMs > lastProgressMs) lastProgressMs = atMs;
  }

  const activated = Boolean(row.milestones.first_order);
  const daysSinceProgress = Math.max(0, Math.floor((now - lastProgressMs) / DAY_MS));

  return {
    ...row,
    ageDays,
    reachedCount,
    furthest,
    furthestLabel,
    daysSinceProgress,
    activated,
    isStuck: !activated && daysSinceProgress > STUCK_THRESHOLD_DAYS,
    goalSet: Boolean(row.milestones.goal_set),
  };
}
