/**
 * Concessão manual de plano — a cortesia que o admin dá pela tela, sem Stripe.
 *
 * Vive separado da rota porque é decisão de cobrança: `entitlements.ts` lê
 * `subscriptions.status` para decidir teto, então errar o payload aqui libera
 * (ou tranca) plano pago sem passar por nenhum pagamento. E vive fora de
 * `entitlements.ts` porque aquele importa "server-only" e não roda sob
 * `tsx --test`.
 *
 * O que este módulo NÃO faz, de propósito:
 *
 * - **Não inventa prazo.** `subscriptionAccess` concede direto para `active`,
 *   sem olhar `current_period_end`. Gravar uma data de expiração aqui daria
 *   uma falsa sensação de cortesia temporária: o acesso continuaria valendo
 *   depois dela. Concessão manual vale até ser revogada, e a tela diz isso.
 * - **Não toca em `stripe_*`.** Se o tenant já teve assinatura real, o
 *   histórico fica: apagar o `stripe_subscription_id` faria o próximo webhook
 *   do Stripe não achar a linha e criar uma segunda, contra o
 *   `unique(tenant_id)`.
 *
 * Consequência que o admin precisa saber: se existir assinatura Stripe ativa
 * para este tenant, um evento futuro do Stripe sobrescreve o status concedido
 * aqui. `metadata.manual_grant` é o rastro que explica de onde veio o acesso.
 */

/** O que fica registrado em `subscriptions.metadata.manual_grant`. */
export type ManualGrantTrail = {
  granted_by: string;
  granted_at: string;
  reason: string | null;
  revoked_by?: string;
  revoked_at?: string;
};

/**
 * Metadata é jsonb: nada garante a forma. Um valor não-objeto (string, array,
 * número) viraria spread silencioso e apagaria o `stripe_status` que
 * `subscriptionAccess` lê — por isso a fronteira é validada, não presumida.
 */
function metadataBase(current: unknown): Record<string, unknown> {
  if (!current || typeof current !== "object" || Array.isArray(current)) return {};
  return { ...(current as Record<string, unknown>) };
}

function limparRazao(reason: string | null | undefined): string | null {
  const t = reason?.trim();
  return t ? t.slice(0, 300) : null;
}

export type ManualGrantRow = {
  tenant_id: string;
  plan_id: string;
  status: "active";
  cancel_at_period_end: false;
  canceled_at: null;
  metadata: Record<string, unknown>;
};

export function buildManualGrant(input: {
  tenantId: string;
  planId: string;
  adminEmail: string;
  reason?: string | null;
  currentMetadata?: unknown;
  now: Date;
}): ManualGrantRow {
  const metadata = metadataBase(input.currentMetadata);
  const trail: ManualGrantTrail = {
    granted_by: input.adminEmail,
    granted_at: input.now.toISOString(),
    reason: limparRazao(input.reason),
  };
  metadata.manual_grant = trail;

  return {
    tenant_id: input.tenantId,
    plan_id: input.planId,
    status: "active",
    // Cortesia não tem cobrança agendada: deixar `cancel_at_period_end` ligado
    // de uma assinatura Stripe anterior faria a tela do lojista anunciar um
    // fim que não existe.
    cancel_at_period_end: false,
    canceled_at: null,
    metadata,
  };
}

export type ManualRevokeRow = {
  status: "canceled";
  canceled_at: string;
  metadata: Record<string, unknown>;
};

/**
 * Revoga a cortesia. `plan_id` fica: é histórico de qual plano foi concedido, e
 * a coluna é NOT NULL — zerar exigiria escolher outro plano arbitrário.
 */
export function buildManualRevoke(input: {
  adminEmail: string;
  currentMetadata?: unknown;
  now: Date;
}): ManualRevokeRow {
  const metadata = metadataBase(input.currentMetadata);
  const anterior = metadata.manual_grant;
  const base: Record<string, unknown> =
    anterior && typeof anterior === "object" && !Array.isArray(anterior)
      ? { ...(anterior as Record<string, unknown>) }
      : {};

  metadata.manual_grant = {
    ...base,
    revoked_by: input.adminEmail,
    revoked_at: input.now.toISOString(),
  };

  return { status: "canceled", canceled_at: input.now.toISOString(), metadata };
}
