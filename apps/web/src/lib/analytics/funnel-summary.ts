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
  | "payment_completed"
  | "referral_sent";
// `trial_started` foi removido: a oferta atual não tem trial (ver o comentário em
// api/cron/emails, que aposentou o e-mail de trial pelo mesmo motivo). O evento
// existia no tipo desde o começo, nunca teve quem o emitisse e nunca gerou uma
// linha em `funnel_events`. O `trialing` que aparece no admin é status de
// assinatura do Stripe, não um marco do nosso funil.

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

/**
 * Leitura do agregado que o banco devolve (D.5 da auditoria de 22/08/2026).
 *
 * Antes, o admin lia `funnel_events` linha a linha e contava em JS. O PostgREST
 * corta a resposta em `max-rows` (1000) **sem erro nenhum**: passando disso, o
 * funil simplesmente contava menos e ninguem ficava sabendo. Agora o `group by`
 * acontece no banco e as RPCs devolvem um unico `jsonb`, que nao tem limite de
 * linhas para ser cortado.
 *
 * As funcoes abaixo sao a fronteira: o que vem do banco e `unknown` ate ser
 * validado.
 */

function isRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** `{ signup: 12, ... }` vindo de `public.funnel_event_counts()`. */
export function parseFunnelCounts(payload: unknown): Record<FunnelEvent, number> {
  if (!isRegistro(payload)) return {} as Record<FunnelEvent, number>;

  const contagens: Record<string, number> = {};
  for (const [evento, total] of Object.entries(payload)) {
    if (typeof total === "number" && Number.isFinite(total)) contagens[evento] = total;
  }

  return contagens as Record<FunnelEvent, number>;
}

/** Lista de tenants vinda de `public.funnel_tenant_matrix()`. */
export function parseTenantFunnelMatrix(payload: unknown): TenantFunnelRow[] {
  if (!Array.isArray(payload)) return [];

  const linhas: TenantFunnelRow[] = [];
  for (const bruta of payload) {
    if (!isRegistro(bruta)) continue;

    const tenantId = bruta.tenant_id;
    const createdAt = bruta.created_at;
    // Sem id ou sem data de criacao a linha nao serve para nada a jusante:
    // `summarizeTenantFunnel` calcula idade a partir do createdAt.
    if (typeof tenantId !== "string" || typeof createdAt !== "string") continue;

    const milestones: Partial<Record<FunnelEvent, string>> = {};
    if (isRegistro(bruta.milestones)) {
      for (const [evento, quando] of Object.entries(bruta.milestones)) {
        if (typeof quando === "string") milestones[evento as FunnelEvent] = quando;
      }
    }

    linhas.push({
      tenantId,
      name: typeof bruta.name === "string" ? bruta.name : "—",
      createdAt,
      milestones,
    });
  }

  return linhas;
}
