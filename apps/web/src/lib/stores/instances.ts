import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Acesso a `instances` — a conta de WhatsApp de um tenant.
 *
 * Escritas de status passam pelos RPCs `update_instance_status` e
 * `record_engine_event` (security definer, já existentes) em vez de UPDATE
 * direto: eles centralizam as transições de `connected_at`/`disconnected_at`,
 * a limpeza do `qr_code` e o upsert idempotente por `event_id`.
 */

export type InstanceStatus =
  | "pending"
  | "qr"
  | "connecting"
  | "connected"
  | "disconnected"
  | "blocked"
  | "error";

export type Instance = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  status: InstanceStatus;
  qr_code: string | null;
  provider: string;
  provider_instance_id: string | null;
  last_seen_at: string | null;
  connected_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const TABLE = "instances";

/** Colunas seguras para devolver ao painel. `qr_code` só sai em `getInstance`. */
const LIST_COLUMNS =
  "id, tenant_id, name, phone, status, provider, provider_instance_id, last_seen_at, connected_at, metadata, created_at, updated_at";

const FULL_COLUMNS = `${LIST_COLUMNS}, qr_code`;

export async function listInstances(tenantId: string): Promise<Instance[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(FULL_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Instance[];
}

export async function getInstance(tenantId: string, id: string): Promise<Instance | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(FULL_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Instance) ?? null;
}

/**
 * Resolve um webhook de volta para a instância dona.
 *
 * Sem `tenant_id` de propósito: o webhook chega sem contexto de tenant e é
 * justamente esta consulta que o descobre. O índice único parcial
 * `(provider, provider_instance_id)` garante no máximo uma linha.
 */
export async function findByProviderInstanceId(
  providerInstanceId: string,
  provider = "evolution",
): Promise<Instance | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(FULL_COLUMNS)
    .eq("provider", provider)
    .eq("provider_instance_id", providerInstanceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Instance) ?? null;
}

export async function setProviderInstanceId(
  tenantId: string,
  id: string,
  providerInstanceId: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ provider: "evolution", provider_instance_id: providerInstanceId })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteInstanceRow(tenantId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

type UpdateStatusInput = {
  tenantId: string;
  instanceId: string;
  status: InstanceStatus;
  phone?: string | null;
  /** Só persistido quando `status === "qr"` — o RPC limpa o campo nos demais. */
  qrCode?: string | null;
  metadata?: Record<string, unknown>;
};

export async function updateInstanceStatus(input: UpdateStatusInput): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("update_instance_status", {
    target_tenant_id: input.tenantId,
    target_instance_id: input.instanceId,
    target_status: input.status,
    target_phone: input.phone ?? null,
    target_qr_code: input.qrCode ?? null,
    target_engine_node: null,
    target_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

type RecordEventInput = {
  tenantId: string;
  instanceId: string;
  type: string;
  /** Já sem credencial — passe por `stripCredentials` antes. */
  payload: Record<string, unknown>;
  /** UUID v5 determinístico; o UNIQUE torna reentrega um no-op. */
  eventId: string;
};

export type RecordedEvent = {
  /**
   * `false` quando este `event_id` já tinha sido gravado — ou seja, a Evolution
   * reentregou o mesmo evento.
   *
   * Quem só grava a trilha pode ignorar (o UNIQUE já faz a reentrega ser
   * inofensiva). Quem aplica EFEITO RELATIVO a partir do evento não pode: somar
   * o mesmo delta duas vezes corrompe a contagem em silêncio, e nada depois
   * denuncia o erro. É o caso do delta de administradores em
   * `group-participants.update`.
   */
  isNew: boolean;
};

export async function recordEngineEvent(input: RecordEventInput): Promise<RecordedEvent> {
  const { data, error } = await getSupabaseAdmin().rpc("record_engine_event", {
    target_tenant_id: input.tenantId,
    target_instance_id: input.instanceId,
    target_type: input.type,
    target_payload: input.payload,
    target_event_id: input.eventId,
  });
  if (error) throw new Error(error.message);

  // `now()` é constante dentro de uma transação: na inserção os dois carimbos
  // são idênticos, e o `on conflict do update set updated_at = now()` da RPC só
  // os separa numa reentrega, que roda em outra transação.
  const row = data as { created_at?: string; updated_at?: string } | null;
  return { isNew: Boolean(row) && row?.created_at === row?.updated_at };
}
