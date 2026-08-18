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
 * Escolhe qual convite pendente aceitar para um dado e-mail.
 *
 * Casa `invited_email` de forma case-insensitive e, havendo mais de um convite
 * pendente (tenants diferentes convidaram o mesmo e-mail), fica com o mais
 * antigo — mesma precedência de `members/accept`, que aceita um por vez. E-mail
 * vazio nunca casa: sem e-mail não há como atribuir o convite com segurança.
 */
export function selectPendingInvite(
  invites: readonly PendingInvite[],
  email: string | null | undefined,
): PendingInvite | null {
  const target = normalizeInviteEmail(email);
  if (!target) return null;

  const matches = invites
    .filter((invite) => normalizeInviteEmail(invite.invited_email) === target)
    .sort((a, b) => oldestFirst(a.created_at, b.created_at));

  return matches[0] ?? null;
}

/** Ordena por `created_at` ascendente; nulos vão para o fim. */
function oldestFirst(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}
