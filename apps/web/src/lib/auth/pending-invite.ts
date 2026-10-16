/**
 * Regra pura do vínculo de convite pendente no primeiro login social.
 *
 * Vive fora de `lib/supabase/*` de propósito: aquele módulo é `server-only` e
 * não carrega sob `tsx --test`. Aqui fica só a decisão sem I/O, testável direto.
 *
 * O bug que isto corrige (o "tenant fantasma"): um convidado tem uma membership
 * com `user_id` nulo e `accepted_at` nulo, casada só pelo `invited_email`. No
 * primeiro login via Google o provisionamento buscava membership por
 * `user_id`, não achava a pendente, e criava uma organização nova — o convidado
 * virava dono de um tenant vazio em vez de entrar no de quem o convidou.
 */

/** Uma membership de convite ainda não vinculada a um usuário. */
export interface PendingInvite {
  id: string;
  tenant_id: string;
  role: string | null;
  invited_email: string | null;
  created_at: string | null;
}

/** Normaliza e-mail para comparação: sem espaços e caixa-baixa. */
export function normalizeInviteEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Prova de que quem está entrando é dono do e-mail convidado. Sem ela, nenhum
 * convite é aceito: o cadastro por senha cria a conta já confirmada, então
 * "digitou o e-mail do convite" não prova nada — quem soubesse o e-mail entrava
 * na loja com o papel do convite (até admin).
 */
export type InviteOwnershipProof =
  /** Veio pelo link do e-mail de convite: só quem lê a caixa tem este id. */
  | { inviteId: string }
  /** O Google já verificou o e-mail (identidade google com o mesmo e-mail). */
  | { emailVerifiedBy: "google" };

/** Identidade de login como o Supabase Auth devolve em `user.identities`. */
export interface AuthIdentity {
  provider: string;
  identity_data?: Record<string, unknown>;
}

/**
 * Prova pelo Google: só vale a identidade `google` cujo e-mail é o mesmo da
 * conta. Uma conta de senha (ou um Google de outro e-mail) não prova posse.
 */
export function googleOwnershipProof(
  identities: readonly AuthIdentity[] | null | undefined,
  email: string | null | undefined,
): InviteOwnershipProof | null {
  const target = normalizeInviteEmail(email);
  if (!target) return null;

  const verified = (identities ?? []).some(
    (identity) =>
      identity.provider === "google" &&
      normalizeInviteEmail(String(identity.identity_data?.email ?? "")) === target,
  );
  return verified ? { emailVerifiedBy: "google" } : null;
}

/**
 * Escolhe qual convite pendente aceitar para um dado e-mail.
 *
 * Casa `invited_email` de forma case-insensitive. Pelo link do convite, aceita
 * exatamente aquele convite (e só se for deste e-mail). Pelo Google, havendo
 * mais de um convite pendente (tenants diferentes convidaram o mesmo e-mail),
 * fica com o mais antigo — mesma precedência de `members/accept`, que aceita um
 * por vez. E-mail vazio ou sem prova de posse nunca casa.
 */
export function selectPendingInvite(
  invites: readonly PendingInvite[],
  email: string | null | undefined,
  proof: InviteOwnershipProof | null,
): PendingInvite | null {
  const target = normalizeInviteEmail(email);
  if (!target || !proof) return null;

  const matches = invites
    .filter((invite) => normalizeInviteEmail(invite.invited_email) === target)
    .sort((a, b) => oldestFirst(a.created_at, b.created_at));

  if ("inviteId" in proof) return matches.find((invite) => invite.id === proof.inviteId) ?? null;
  return matches[0] ?? null;
}

/**
 * O cadastro por senha deste e-mail precisa do link do convite? Sim quando há
 * convite pendente para ele e `inviteId` não é um desses convites.
 *
 * O chamador recusa ANTES de criar o usuário: a conta nasce confirmada, então
 * criá-la sem o link deixaria a dona do e-mail como dona de uma loja vazia, com
 * o convite pendurado para sempre — e daria a quem só sabe o e-mail um jeito de
 * inutilizar o convite dela. Casa o e-mail exato (normalizado), não o `ilike`.
 */
export function requiresInviteLink(
  invites: readonly PendingInvite[],
  email: string | null | undefined,
  inviteId: string,
): boolean {
  const target = normalizeInviteEmail(email);
  const invited = invites.some((invite) => normalizeInviteEmail(invite.invited_email) === target);
  if (!target || !invited) return false;
  return !selectPendingInvite(invites, email, inviteId ? { inviteId } : null);
}

/** Ordena por `created_at` ascendente; nulos vão para o fim. */
function oldestFirst(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}
