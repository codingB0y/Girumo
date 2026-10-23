import type { ParticipantLike } from "@/lib/groups/admin-protection";

export type TipoDeMovimento = "join" | "leave";

/** O que um `group-participants.update` vira em `group_member_events`. */
export type MovimentoDeMembros = {
  kind: TipoDeMovimento;
  /** Ids como a Evolution manda (`@lid`, quase sempre), sem repetição. */
  participants: string[];
  /** O minuto em que o aviso chegou, em ISO. */
  occurredAt: string;
};

const UM_MINUTO_MS = 60_000;

/**
 * Entrada e saída de verdade (painel D, PR D).
 *
 * Só `add` e `remove` mudam quem está no grupo; `promote` e `demote` trocam o
 * papel de quem já estava, como em `memberCountDelta`.
 *
 * O horário é o de quando o aviso chegou (`agora`), não o `date_time` da
 * Evolution: ela manda a hora de Brasília com "Z" de UTC (medido em produção em
 * 01/10/2026: "2026-09-30T23:22:25.226Z" chegou às 02:22:25.947Z), o que jogava
 * cada entrada 3 horas para trás. O webhook chega em menos de um segundo.
 *
 * O horário é truncado no minuto de propósito: dois números da mesma loja no
 * mesmo grupo recebem o mesmo aviso com milissegundos de diferença, e o índice
 * único da tabela só junta os dois se o horário for igual. Se as duas entregas
 * caírem dos dois lados da virada do minuto, a pessoa conta duas vezes: raro
 * (só loja com 2+ números no grupo) e aceito.
 */
/**
 * A pessoa saiu por conta própria: o autor do `remove` é ela mesma. Remoção por
 * admin (inclusive o "remover duplicados") traz outro autor. É a saída
 * voluntária que alimenta o disjuntor do anti-ban (`avaliar_disjuntor_saidas`),
 * porque a tela de sair do WhatsApp oferece "Sair e denunciar".
 */
export function temSaidaVoluntaria(
  action: string,
  participants: ParticipantLike[] | null | undefined,
  author: string | null | undefined,
): boolean {
  if (String(action ?? "").toLowerCase() !== "remove") return false;
  const autor = String(author ?? "").trim();
  if (!autor) return false;
  return (participants ?? []).some((p) => String(p?.id ?? "").trim() === autor);
}

export function movimentoDeMembros(
  action: string,
  participants: ParticipantLike[] | null | undefined,
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

  return {
    kind,
    participants: [...ids],
    occurredAt: new Date(Math.floor(agora.getTime() / UM_MINUTO_MS) * UM_MINUTO_MS).toISOString(),
  };
}
