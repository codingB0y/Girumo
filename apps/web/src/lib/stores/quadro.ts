import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { BoardEvent, BoardFeature, BoardPriority, BoardStatus } from "@/lib/quadro/status";

export interface QuadroSnapshot {
  features: BoardFeature[];
  events: BoardEvent[];
}

const FEED_LIMIT = 30;

type FeatureRow = {
  id: string;
  key: string;
  title: string;
  area: string;
  status: string;
  summary: string | null;
  blocker: string | null;
  evidence: string | null;
  evidence_at: string | null;
  priority: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  feature_id: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  ref: string | null;
  actor: string;
  created_at: string;
};

function toFeature(row: FeatureRow): BoardFeature {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    area: row.area,
    status: row.status as BoardStatus,
    summary: row.summary,
    blocker: row.blocker,
    evidence: row.evidence,
    evidenceAt: row.evidence_at,
    priority: row.priority as BoardPriority,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEvent(row: EventRow): BoardEvent {
  return {
    id: row.id,
    featureId: row.feature_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    ref: row.ref,
    actor: row.actor === "igor" ? "igor" : "claude",
    createdAt: row.created_at,
  };
}

/**
 * Lê o quadro inteiro. São dezenas de cards, não milhares — buscar tudo e
 * agrupar em memória é mais simples e mais barato que paginar.
 */
export async function loadQuadro(): Promise<QuadroSnapshot> {
  const supabase = getSupabaseAdmin();

  const [featuresResult, eventsResult] = await Promise.all([
    supabase
      .from("board_features")
      .select(
        "id, key, title, area, status, summary, blocker, evidence, evidence_at, priority, sort_order, created_at, updated_at",
      )
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    supabase
      .from("board_events")
      .select("id, feature_id, from_status, to_status, note, ref, actor, created_at")
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
  ]);

  if (featuresResult.error) {
    throw new Error(`Falha ao ler board_features: ${featuresResult.error.message}`);
  }
  if (eventsResult.error) {
    throw new Error(`Falha ao ler board_events: ${eventsResult.error.message}`);
  }

  return {
    features: ((featuresResult.data ?? []) as FeatureRow[]).map(toFeature),
    events: ((eventsResult.data ?? []) as EventRow[]).map(toEvent),
  };
}

/** Move o card. O ator é sempre 'igor': quem passa por aqui é a UI, não o agente. */
export async function moveCard(input: {
  key: string;
  status: BoardStatus;
  note: string;
  ref?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.rpc("move_card", {
    p_key: input.key,
    p_status: input.status,
    p_note: input.note,
    p_ref: input.ref ?? null,
    p_actor: "igor",
  });

  if (error) throw new Error(`Falha ao mover ${input.key}: ${error.message}`);
}

/** Edita campos que não são status. Mudança de status passa obrigatoriamente por moveCard. */
export async function updateFeature(
  key: string,
  patch: {
    summary?: string | null;
    blocker?: string | null;
    priority?: BoardPriority;
    sortOrder?: number;
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const row: Record<string, unknown> = {};
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.blocker !== undefined) row.blocker = patch.blocker;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;

  if (Object.keys(row).length === 0) return;

  const { error } = await supabase.from("board_features").update(row).eq("key", key);
  if (error) throw new Error(`Falha ao editar ${key}: ${error.message}`);
}

/** Cria card novo, sempre em 'nao_existe'. */
export async function createFeature(input: {
  key: string;
  title: string;
  area: string;
  summary?: string | null;
  priority?: BoardPriority;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("board_features").insert({
    key: input.key,
    title: input.title,
    area: input.area,
    summary: input.summary ?? null,
    priority: input.priority ?? "media",
    status: "nao_existe",
  });

  if (error) {
    // 23505 = unique_violation na coluna key
    if (error.code === "23505") throw new Error(`DUPLICADO:${input.key}`);
    throw new Error(`Falha ao criar ${input.key}: ${error.message}`);
  }
}
