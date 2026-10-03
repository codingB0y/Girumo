import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClaimCardResult, ClaimTrialResult } from "./stripe-webhook";

/**
 * As duas reservas do teste grátis em `organizations`, fora da rota para serem
 * testadas com um cliente falso (mesmo padrão de `trial-facts.ts`).
 *
 * O cliente é o service-role, que ignora RLS: o par `.eq("id").eq("tenant_id")` é o
 * isolamento entre contas, e o `.is(coluna, null)` é a reserva. Sem eles o update
 * gravaria o teste em toda organização com a coluna vazia.
 */

/** 23505 = unique_violation: o índice único de `trial_card_fingerprint` negou. */
const UNIQUE_VIOLATION = "23505";

/**
 * Grava `organizations.trial_subscription_id` se ainda estiver vazio.
 *
 * Nunca limpa a coluna: a guarda de reenvio do `trial_duplicate` no webhook conta
 * com a reserva, uma vez feita, ficar feita.
 */
export async function claimTrial(
  supabase: SupabaseClient,
  { tenantId, subscriptionId }: { tenantId: string; subscriptionId: string },
): Promise<ClaimTrialResult> {
  const { data, error } = await supabase
    .from("organizations")
    .update({ trial_subscription_id: subscriptionId })
    .eq("id", tenantId)
    .eq("tenant_id", tenantId)
    .is("trial_subscription_id", null)
    .select("trial_subscription_id")
    .maybeSingle();
  if (error) return { outcome: "lost", winnerId: null, error: error.message };
  if (data) return { outcome: "won", winnerId: subscriptionId, error: null };

  // Nada casou: alguém já reservou. Pode ser esta mesma assinatura (retry).
  const { data: atual, error: readError } = await supabase
    .from("organizations")
    .select("trial_subscription_id")
    .eq("id", tenantId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (readError) return { outcome: "lost", winnerId: null, error: readError.message };
  const winnerId = (atual?.trial_subscription_id as string | null | undefined) ?? null;
  // Sem organização não há onde reservar: erro, para o Stripe reenviar e o log mostrar.
  if (!winnerId) return { outcome: "lost", winnerId: null, error: `organizacao ${tenantId} nao encontrada` };
  return { outcome: winnerId === subscriptionId ? "same" : "lost", winnerId, error: null };
}

/**
 * Grava `organizations.trial_card_fingerprint`; o índice único decide entre contas.
 * Devolve `ok` também quando o fingerprint já é DESTA conta (retry do mesmo evento).
 */
export async function claimCardFingerprint(
  supabase: SupabaseClient,
  { tenantId, fingerprint }: { tenantId: string; fingerprint: string },
): Promise<ClaimCardResult> {
  const { error } = await supabase
    .from("organizations")
    .update({ trial_card_fingerprint: fingerprint })
    .eq("id", tenantId)
    .eq("tenant_id", tenantId)
    .is("trial_card_fingerprint", null);
  // Índice único: outra conta já testou com este cartão. Não é falha, é a trava.
  if (error?.code === UNIQUE_VIOLATION) return { outcome: "taken", error: null };
  if (error) return { outcome: "ok", error: error.message };
  // Zero linhas casadas também é "ok": a conta já tinha o cartão gravado (retry).
  return { outcome: "ok", error: null };
}
