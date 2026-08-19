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
