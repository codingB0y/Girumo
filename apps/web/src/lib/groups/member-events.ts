import type { ParticipantLike } from "@/lib/groups/admin-protection";

export type TipoDeMovimento = "join" | "leave";

/** O que um `group-participants.update` vira em `group_member_events`. */
export type MovimentoDeMembros = {
  kind: TipoDeMovimento;
  /** Ids como a Evolution manda (`@lid`, quase sempre), sem repetição. */
  participants: string[];
  /** O minuto do aviso, em ISO. */
  occurredAt: string;
};

const UM_MINUTO_MS = 60_000;

/**
 * Entrada e saída de verdade (painel D, PR D).
 *
 * Só `add` e `remove` mudam quem está no grupo; `promote` e `demote` trocam o
 * papel de quem já estava, como em `memberCountDelta`.
 *
 * O horário é truncado no minuto de propósito: dois números da mesma loja no
 * mesmo grupo recebem o mesmo aviso com milissegundos de diferença, e o índice
 * único da tabela só junta os dois se o horário for igual. Um `date_time` que
 * não parseia vira o minuto de agora: o webhook chega na hora do fato.
 */
export function movimentoDeMembros(
  action: string,
  participants: ParticipantLike[] | null | undefined,
  dateTime: string,
  agora: Date = new Date(),
): MovimentoDeMembros | null {
  const acao = String(action ?? "").toLowerCase();
  const kind: TipoDeMovimento | null = acao === "add" ? "join" : acao === "remove" ? "leave" : null;
  if (!kind) return null;

  const ids = new Set<string>();
  for (const p of participants ?? []) {
    const id = String(p?.id ?? "").trim();
    if (id) ids.add(id);
  }
  if (ids.size === 0) return null;

  const ms = Date.parse(dateTime);
  const quando = Number.isFinite(ms) ? ms : agora.getTime();
  return {
    kind,
    participants: [...ids],
    occurredAt: new Date(Math.floor(quando / UM_MINUTO_MS) * UM_MINUTO_MS).toISOString(),
  };
}
