/**
 * Decisões do backfill de convite — funções PURAS.
 *
 * Mora fora de `lib/stores/groups.ts` e de `lib/evolution/client.ts` de
 * propósito: os dois começam com `import "server-only"`, que quebra sob
 * `tsx --test`. Mesmo arranjo de `lib/evolution/admin-group.ts`.
 */

import { normalizeInviteUrl } from "@/lib/groups/invite-url";

/** Só o que a decisão precisa de um grupo (evita importar o tipo server-only). */
export type BackfillCandidate = {
  id: string;
  whatsapp_group_id: string;
  name: string;
  members: number;
  is_admin?: boolean;
  invite_url?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type InviteFailureVerdict = "permanent" | "transient";

export type InviteFailure = { verdict: InviteFailureVerdict; reason: string };

export type InviteFetchMarker = { failed: true; reason: string; at: string };

const REASON_MAX_LENGTH = 200;

/**
 * Vocabulário de erro da Evolution → motivo legível. Único lugar do sistema que
 * conhece esses padrões: a rota consome o `reason` já traduzido em vez de ter a
 * própria cópia das regexes.
 *
 * Mesmo vocabulário de `classifyGroupOpError` da engine.
 */
const PERMANENT_REASONS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b403\b|forbidden|not-authorized/i, reason: "a conta não é mais admin do grupo" },
  { pattern: /locked/i, reason: "o grupo está travado para convites" },
  { pattern: /\bgone\b/i, reason: "o convite foi revogado no WhatsApp" },
];

const UNKNOWN_PERMANENT_REASON = "a Evolution não devolveu o convite";

function hasFailedMarker(group: BackfillCandidate): boolean {
  const marker = group.metadata?.inviteFetch;
  return typeof marker === "object" && marker !== null && (marker as { failed?: unknown }).failed === true;
}

/**
 * Grupos que ainda podem ganhar convite, os mais cheios primeiro.
 *
 * A ordem por membros é o que prioriza quem está em zona de lotação sem
 * precisar de código especial pra isso.
 */
export function selectBackfillCandidates(
  groups: readonly BackfillCandidate[],
  limit: number,
): BackfillCandidate[] {
  return groups
    .filter((g) => g.is_admin === true)
    .filter((g) => !g.invite_url || g.invite_url.trim() === "")
    .filter((g) => !hasFailedMarker(g))
    .slice()
    .sort((a, b) => b.members - a.members)
    .slice(0, Math.max(0, limit));
}

/**
 * Extrai o convite da resposta da Evolution (`{ inviteUrl, inviteCode }`).
 *
 * `null` quando não há convite utilizável. Passa por `normalizeInviteUrl`
 * porque é resposta de terceiro: uma URL que não seja do WhatsApp entraria no
 * banco calada e só apareceria como funil furado no `/r/<slug>`.
 */
export function parseInviteCodeResponse(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const candidate = typeof record.inviteUrl === "string" && record.inviteUrl
    ? record.inviteUrl
    : typeof record.inviteCode === "string"
      ? record.inviteCode
      : null;
  if (!candidate) return null;
  return normalizeInviteUrl(candidate);
}

/**
 * Falha definitiva ou passageira?
 *
 * A Evolution 2.3.7 achata TODA falha de grupo num 404 `No invite code`
 * (whatsapp.baileys.service.ts:4483), então num 404 o status não informa nada e
 * a causa real vive no detail. Mas em rede/5xx o status é o que vale — por isso
 * ele é checado ANTES do detail.
 */
export function classifyInviteFailure(input: { status: number; detail?: string | null }): InviteFailure {
  if (input.status === 0) return { verdict: "transient", reason: "a Evolution não respondeu" };
  if (input.status >= 500) return { verdict: "transient", reason: "a Evolution falhou temporariamente" };

  const detail = (input.detail ?? "").trim();
  const known = PERMANENT_REASONS.find((entry) => entry.pattern.test(detail));
  if (known) return { verdict: "permanent", reason: known.reason };

  // Sem tradução conhecida, o texto cru é melhor que silêncio: é a única pista
  // de quem for decidir no painel se vale tentar de novo.
  return { verdict: "permanent", reason: detail || UNKNOWN_PERMANENT_REASON };
}

/** Marcador gravado em `groups.metadata.inviteFetch`. `now` entra por parâmetro pra ser testável. */
export function buildInviteFetchMarker(reason: string, now: Date): InviteFetchMarker {
  return { failed: true, reason: reason.slice(0, REASON_MAX_LENGTH), at: now.toISOString() };
}

/**
 * Remove o marcador de falha, devolvendo o grupo à fila do cron.
 *
 * Imutável: devolve objeto novo. O resto do metadata é preservado — ele
 * carrega coisa de outras features.
 */
export function clearInviteFetchMarker(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { inviteFetch: _removed, ...rest } = metadata;
  return rest;
}
