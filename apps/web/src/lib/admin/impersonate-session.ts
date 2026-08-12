/** Validade do cookie de impersonation — o mesmo prazo que o `maxAge` promete ao navegador. */
export const IMPERSONATE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * O cookie `dz_impersonate` é assinado (HMAC), mas a assinatura não carrega prazo:
 * `maxAge` é instrução pro navegador, e quem copiar o valor continua mandando ele
 * pra sempre. Como o DELETE devolve a sessão do super-admin a partir desse cookie,
 * o servidor precisa cobrar a idade que o cookie já promete.
 */
export function isImpersonateFresh(startedAt: unknown, now: number = Date.now()): boolean {
  if (typeof startedAt !== "string") return false;
  const age = now - Date.parse(startedAt);
  // `age >= 0` recusa data adiantada: cookie forjado não compra validade extra.
  return Number.isFinite(age) && age >= 0 && age < IMPERSONATE_MAX_AGE_MS;
}
