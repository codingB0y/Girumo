import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

export type RunStatus = "queued" | "active" | "done" | "stopped" | "failed";
export type SourceKind = "comment" | "dm" | "story";

export type RunRow = {
  id: string;
  tenant_id: string;
  ig_account_id: string | null;
  flow_id: string;
  flow_version: number;
  source_kind: SourceKind;
  source_id: string;
  ig_user_id: string;
  username: string | null;
  matched_keyword: string | null;
  ref: string;
  status: RunStatus;
  node_id: string | null;
  waiting: "reply" | "click" | null;
  wake_at: string | null;
  window_expires_at: string | null;
  clicked_at: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

const COLS =
  "id, tenant_id, ig_account_id, flow_id, flow_version, source_kind, source_id, ig_user_id, username, matched_keyword, ref, status, node_id, waiting, wake_at, window_expires_at, clicked_at, error_code, error_message, started_at, updated_at, finished_at";

export type NovoRun = {
  igAccountId: string;
  flowId: string;
  flowVersion: number;
  sourceKind: SourceKind;
  sourceId: string;
  igUserId: string;
  username: string | null;
  matchedKeyword: string | null;
  ref: string;
  windowExpiresAt: string;
};

export type RunPatch = Partial<Pick<RunRow, "status" | "node_id" | "waiting" | "wake_at" | "error_code" | "error_message" | "finished_at">>;

/**
 * `null` = já existe run com este `source_id` (reenvio da Zernio): o índice único
 * é a idempotência. Colisão em outro índice único (o do `ref`) NÃO é reenvio e estoura.
 */
export async function createRun(tenantId: string, input: NovoRun): Promise<RunRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_runs")
    .insert({
      tenant_id: tenantId,
      ig_account_id: input.igAccountId,
      flow_id: input.flowId,
      flow_version: input.flowVersion,
      source_kind: input.sourceKind,
      source_id: input.sourceId,
      ig_user_id: input.igUserId,
      username: input.username,
      matched_keyword: input.matchedKeyword,
      ref: input.ref,
      status: "queued",
      window_expires_at: input.windowExpiresAt,
    })
    .select(COLS)
    .single();
  if (error) {
    if (error.code === "23505" && `${error.message} ${error.details ?? ""}`.includes("ig_runs_source_uidx")) return null;
    throw new Error(error.message);
  }
  return data as unknown as RunRow;
}

export async function getRunBySourceId(tenantId: string, sourceId: string): Promise<RunRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_runs").select(COLS).eq("tenant_id", tenantId).eq("source_id", sourceId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as RunRow | null) ?? null;
}

export async function updateRun(tenantId: string, id: string, patch: RunPatch): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * O run desta pessoa que espera resposta no direct, o mais recente. Procura
 * pelo id e, se não achar, pelo @: o id de quem comentou pode não ser o mesmo
 * do direct. Duas consultas em vez de `.or()` porque o @ vem de fora.
 */
export async function getWaitingRun(tenantId: string, igAccountId: string, igUserId: string, username: string | null, agoraIso: string): Promise<RunRow | null> {
  const buscar = async (coluna: "ig_user_id" | "username", valor: string) => {
    const { data, error } = await getSupabaseAdmin()
      .from("ig_runs")
      .select(COLS)
      .eq("tenant_id", tenantId)
      .eq("ig_account_id", igAccountId)
      .eq("status", "active")
      .eq("waiting", "reply")
      // Espera vencida não conta: senão um run velho da pessoa esconderia o que vale.
      .gt("wake_at", agoraIso)
      .eq(coluna, valor)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as RunRow[])[0] ?? null;
  };
  return (await buscar("ig_user_id", igUserId)) ?? (username ? await buscar("username", username) : null);
}

/**
 * Tira o run da espera só se ele ainda espera neste bloco, carimbando o direct
 * que o retomou. `false` = outra requisição já levou, ou este direct já
 * retomou outro run (índice único de `resumed_by`).
 */
export async function claimWaitingRun(tenantId: string, id: string, nodeId: string, messageId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_runs")
    .update({ waiting: null, resumed_by: messageId, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("status", "active")
    .eq("waiting", "reply")
    .eq("node_id", nodeId)
    .select("id");
  if (error) {
    if (error.code === "23505" && `${error.message} ${error.details ?? ""}`.includes("ig_runs_resumed_by_uidx")) return false;
    throw new Error(error.message);
  }
  return (data ?? []).length === 1;
}

/** O run que este direct já retomou: o reenvio da Zernio cai aqui. */
export async function getRunResumedBy(tenantId: string, messageId: string): Promise<RunRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_runs").select(COLS).eq("tenant_id", tenantId).eq("resumed_by", messageId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as RunRow | null) ?? null;
}

/** Retomada que parou no meio (função caiu): só um reenvio leva, pelo `updated_at` que ele viu. */
export async function retakeStalledRun(tenantId: string, id: string, updatedAt: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_runs")
    .update({ updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("status", "active")
    .is("waiting", null)
    .eq("updated_at", updatedAt)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

/** Uma linha por transição: é de onde saem os números (fase 3). */
export async function recordStep(tenantId: string, input: { flowId: string; runId: string; nodeId: string; out: string }): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_run_steps").insert({ tenant_id: tenantId, flow_id: input.flowId, run_id: input.runId, node_id: input.nodeId, out: input.out });
  if (error) throw new Error(error.message);
}

/** Teto por conta (a Meta permite 750 respostas privadas por hora). */
export async function countRunsStartedSince(tenantId: string, igAccountId: string, sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from("ig_runs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("ig_account_id", igAccountId).gte("started_at", sinceIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Uma entrada por pessoa por fluxo a cada 24 h. */
export async function hasRecentRun(tenantId: string, flowId: string, igUserId: string, sinceIso: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("ig_runs").select("id").eq("tenant_id", tenantId).eq("flow_id", flowId).eq("ig_user_id", igUserId).gte("started_at", sinceIso).limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** Fluxo pausado ou conta desconectada: o que estava andando para. */
export async function stopActiveRuns(tenantId: string, flowId?: string): Promise<void> {
  const agora = new Date().toISOString();
  let q = getSupabaseAdmin().from("ig_runs").update({ status: "stopped", finished_at: agora, updated_at: agora }).eq("tenant_id", tenantId).in("status", ["queued", "active"]);
  if (flowId) q = q.eq("flow_id", flowId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function listRuns(tenantId: string, flowId: string, limit = 50): Promise<RunRow[]> {
  const { data, error } = await getSupabaseAdmin().from("ig_runs").select(COLS).eq("tenant_id", tenantId).eq("flow_id", flowId).order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RunRow[];
}

/** Retenção de 90 dias (LGPD). Os passos somem em cascata. */
export async function purgeOldRuns(tenantId: string, cutoffIso: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_runs").delete().eq("tenant_id", tenantId).lt("started_at", cutoffIso);
  if (error) throw new Error(error.message);
}
