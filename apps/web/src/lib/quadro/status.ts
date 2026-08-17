export const BOARD_STATUSES = [
  "nao_existe",
  "em_construcao",
  "no_ar_nao_verificado",
  "no_ar_verificado",
  "quebrado",
] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const BOARD_PRIORITIES = ["alta", "media", "baixa"] as const;
export type BoardPriority = (typeof BOARD_PRIORITIES)[number];

/** Estreita o texto que veio do banco ou da rede. Nada de `as BoardStatus` na marra. */
export function isBoardStatus(value: unknown): value is BoardStatus {
  return typeof value === "string" && (BOARD_STATUSES as readonly string[]).includes(value);
}

export function isBoardPriority(value: unknown): value is BoardPriority {
  return typeof value === "string" && (BOARD_PRIORITIES as readonly string[]).includes(value);
}

export function isBoardArea(value: unknown): value is (typeof BOARD_AREAS)[number] {
  return typeof value === "string" && (BOARD_AREAS as readonly string[]).includes(value);
}

/**
 * O eixo dos nomes é **prova**, não estágio de trabalho — é o que a constraint
 * `board_features_verificado_exige_prova` cobra no banco. Os rótulos antigos
 * ("No ar (não verificado)" × "No ar verificado") diferiam por uma negação entre
 * parênteses e ficavam indistinguíveis no cabeçalho em caixa alta.
 */
export const STATUS_LABELS: Record<BoardStatus, string> = {
  nao_existe: "Não construído",
  em_construcao: "Atacando agora",
  no_ar_nao_verificado: "Ninguém conferiu",
  no_ar_verificado: "Provado em produção",
  quebrado: "Quebrado",
};

/**
 * As duas colunas entregues ficam sob um cabeçalho "Feito" — quem procura o feito
 * acha, e continua vendo que metade dele ninguém conferiu. Não é coluna: a coluna
 * "Feito" chapada é a decisão D3 da spec, e é ela que deixa passar feature mergeada
 * que nunca funcionou.
 */
export const FEITO_STATUSES: readonly BoardStatus[] = [
  "no_ar_nao_verificado",
  "no_ar_verificado",
];

/** Uma linha sob o cabeçalho: o nome não precisa carregar a definição sozinho. */
export const STATUS_HINTS: Record<BoardStatus, string> = {
  nao_existe: "não está no produto",
  em_construcao: "foco do momento",
  no_ar_nao_verificado: "mergeado, ninguém olhou depois",
  no_ar_verificado: "alguém viu funcionando",
  quebrado: "está lá e está errado",
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

/** Teto visual da coluna "Atacando agora". Não há trava no banco: trava vira gambiarra. */
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
    grupos[feature.status].push(feature);
  }

  for (const status of BOARD_STATUSES) {
    grupos[status].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "pt-BR"),
    );
  }

  return grupos;
}
