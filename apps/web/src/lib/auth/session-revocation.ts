/**
 * Revogação de sessão por usuário (item L6 da auditoria de 06/08/2026).
 *
 * O cookie `dz_session` vale 30 dias e o logout só apagava o cookie do
 * navegador — o token seguia válido até expirar sozinho. `session_revocations`
 * guarda, por `auth_user_id`, o instante a partir do qual os tokens passam a
 * ser recusados.
 *
 * Este arquivo é puro (sem `server-only`, sem I/O) para rodar sob `tsx --test`.
 * A consulta ao banco fica em quem chama.
 */

/** Margem para relógios não perfeitamente sincronizados entre app e banco. */
const CLOCK_SKEW_MS = 1_000;

/**
 * O token está revogado?
 *
 * @param issuedAt   `iat` do cookie, em ms.
 * @param revokedBefore  `session_revocations.revoked_before`, ou null se o
 *                       usuário nunca revogou nada.
 *
 * Sem linha na tabela, nada está revogado — é o caso da esmagadora maioria dos
 * usuários, e por isso a ausência precisa ser barata e explícita.
 *
 * A comparação é `<`, não `<=`, com folga de 1s: um token emitido no MESMO
 * instante da revogação é o que o próprio logout acabou de criar em alguns
 * fluxos (revoga e reemite), e derrubá-lo faria o usuário não conseguir entrar
 * logo depois de sair.
 */
export function isSessionRevoked(issuedAt: number, revokedBefore: Date | string | null): boolean {
  if (revokedBefore === null || revokedBefore === undefined) return false;

  const cutoff = revokedBefore instanceof Date ? revokedBefore.getTime() : Date.parse(revokedBefore);
  // Data inválida não deve derrubar sessão de ninguém: falha para o lado de
  // deixar passar, e o problema aparece no monitoramento em vez de virar
  // logout em massa.
  if (Number.isNaN(cutoff)) return false;

  return issuedAt < cutoff - CLOCK_SKEW_MS;
}
