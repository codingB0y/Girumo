export const BOARD_STATUSES = [
  "nao_existe",
  "em_construcao",
  "no_ar_nao_verificado",
  "no_ar_verificado",
  "quebrado",
] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number];
export type BoardPriority = "alta" | "media" | "baixa";

export const STATUS_LABELS: Record<BoardStatus, string> = {
  nao_existe: "Não existe",
  em_construcao: "Em construção",
  no_ar_nao_verificado: "No ar (não verificado)",
  no_ar_verificado: "No ar verificado",
  quebrado: "Quebrado / dívida",
};

export const BOARD_AREAS = [
  "Grupos",
  "Campanhas",
  "Disparos",
  "Automações",
  "Páginas",
  "Auth",
  "Engine/Worker",
  "Admin",
  "Landing",
  "Infra",
] as const;

/** Teto visual da coluna "Em construção". Não há trava no banco: trava vira gambiarra. */
export const WIP_LIMIT_EM_CONSTRUCAO = 3;

/** Verificação com mais de 30 dias ganha selo de vencida. */
export const VERIFICATION_STALE_DAYS = 30;

export interface BoardFeature {
  id: string;
  key: string;
  title: string;
  area: string;
  status: BoardStatus;
  summary: string | null;
  blocker: string | null;
  evidence: string | null;
  evidenceAt: string | null;
  priority: BoardPriority;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoardEvent {
  id: string;
  featureId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  ref: string | null;
  actor: "claude" | "igor";
  createdAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Só card verificado vence. Um "no ar não verificado" antigo não ganha selo —
 * ele já está na coluna que conta a verdade.
 */
export function isVerificationStale(
  feature: Pick<BoardFeature, "status" | "evidenceAt">,
  nowMs: number,
): boolean {
  if (feature.status !== "no_ar_verificado") return false;
  if (!feature.evidenceAt) return false;

  const stampedAt = Date.parse(feature.evidenceAt);
  if (Number.isNaN(stampedAt)) return false;

  return nowMs - stampedAt > VERIFICATION_STALE_DAYS * DAY_MS;
}

export function wipState(count: number, limit: number): "ok" | "cheio" | "estourado" {
  if (count > limit) return "estourado";
  if (count === limit) return "cheio";
  return "ok";
}

export function groupByStatus(features: BoardFeature[]): Record<BoardStatus, BoardFeature[]> {
  const grupos = Object.fromEntries(
    BOARD_STATUSES.map((status) => [status, [] as BoardFeature[]]),
  ) as Record<BoardStatus, BoardFeature[]>;

  for (const feature of features) {
    grupos[feature.status]?.push(feature);
  }

  for (const status of BOARD_STATUSES) {
    grupos[status].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "pt-BR"),
    );
  }

  return grupos;
}
