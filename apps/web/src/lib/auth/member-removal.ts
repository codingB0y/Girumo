/**
 * Regra pura de quem pode remover quem da equipe.
 *
 * Vive fora de `lib/supabase/*` porque aquele módulo é `server-only` e não
 * carrega sob `tsx --test`. Aqui fica só a decisão, sem I/O.
 *
 * As três travas existem por motivos distintos:
 *  - auto-remoção: quem gerencia não se tira por acidente e perde o painel;
 *  - admin não remove owner: senão um admin toma o tenant do dono;
 *  - último owner: um tenant sem owner fica sem quem gerencie cobrança e equipe.
 */

export type TenantRole = "owner" | "admin" | "operator";

export interface RemovalActor {
  role: TenantRole;
  /** `auth_user_id` de quem está pedindo a remoção. */
  authUserId: string;
}

export interface RemovalTarget {
  role: TenantRole;
  /** Nulo quando o convite ainda não foi aceito. */
  userId: string | null;
}

export type RemovalDecision =
  | { allowed: true }
  | { allowed: false; reason: RemovalDenial; status: number; message: string };

export type RemovalDenial = "self" | "admin-cannot-remove-owner" | "last-owner";

/**
 * Decide se `actor` pode remover `target`. `ownerCount` é o total de owners
 * ATIVOS do tenant (membership aceita), usado só quando o alvo é owner.
 */
export function canRemoveMember(input: {
  actor: RemovalActor;
  target: RemovalTarget;
  ownerCount: number;
}): RemovalDecision {
  const { actor, target, ownerCount } = input;

  if (target.userId && target.userId === actor.authUserId) {
    return {
      allowed: false,
      reason: "self",
      status: 400,
      message: "Você não pode remover a si mesmo.",
    };
  }

  if (target.role === "owner" && actor.role !== "owner") {
    return {
      allowed: false,
      reason: "admin-cannot-remove-owner",
      status: 403,
      message: "Só o dono da conta pode remover outro dono.",
    };
  }

  // Convite de owner ainda pendente não conta como owner ativo, então remover
  // não deixa o tenant órfão — a trava vale para o owner já efetivado.
  if (target.role === "owner" && target.userId && ownerCount <= 1) {
    return {
      allowed: false,
      reason: "last-owner",
      status: 409,
      message: "Este é o único dono da conta. Promova outro antes de remover.",
    };
  }

  return { allowed: true };
}

/* -------------------------------------------------------------------------- */
/* Interface                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * O que a lista de equipe mostra de cada linha. Menos que a membership
 * inteira: é só o que a tela precisa para decidir botão e texto.
 */
export interface RemovableRow {
  role: string;
  invited_email?: string | null;
  accepted_at?: string | null;
}

/**
 * Se a linha deve oferecer o botão de remover.
 *
 * `owner` fica de fora porque, na prática, é sempre a própria pessoa olhando a
 * lista — e o servidor negaria por auto-remoção ou por último-dono. Botão que
 * só sabe falhar é pior que botão ausente. Para os demais papéis o botão
 * aparece e o servidor continua sendo a autoridade: se negar, a tela mostra o
 * motivo que veio de lá.
 */
export function canOfferRemoval(row: RemovableRow): boolean {
  return row.role !== "owner";
}

/** Como chamar a linha quando não há e-mail (membership aceita antiga). */
function rowLabel(row: RemovableRow): string {
  return row.invited_email?.trim() || "este membro";
}

/**
 * Remover quem já entrou e revogar quem só foi convidado são ações diferentes
 * para quem lê. Trocar os verbos assusta à toa ("remover" num convite pendente
 * sugere que alguém perdeu acesso que nunca teve).
 */
export function removalPrompt(row: RemovableRow): string {
  return row.accepted_at
    ? `Remover ${rowLabel(row)} da equipe? A pessoa perde o acesso ao painel.`
    : `Revogar o convite de ${rowLabel(row)}?`;
}

export function removalSuccess(row: RemovableRow): string {
  return row.accepted_at ? "Membro removido." : "Convite revogado.";
}

export function removalActionLabel(row: RemovableRow): string {
  return row.accepted_at ? `Remover ${rowLabel(row)} da equipe` : `Revogar convite de ${rowLabel(row)}`;
}
