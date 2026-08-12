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
