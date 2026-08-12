/**
 * Quem é super-admin da plataforma, lido de `PLATFORM_ADMIN_EMAILS`.
 *
 * Fail-closed: sem a variável, a lista é VAZIA e ninguém é admin. O default
 * hardcoded que existia aqui (`igor@hubflow.com.br`) dava super-admin a uma
 * identidade que nenhum ambiente havia declarado — e falhava calado, porque um
 * deploy sem a variável parecia configurado. (L3 do `SECURITY_AUDIT.md`)
 *
 * Server-side: `PLATFORM_ADMIN_EMAILS` não é `NEXT_PUBLIC_`, então no browser a
 * lista vem vazia — que é justamente o lado seguro de falhar.
 */

/** Quebra o valor cru da env var em e-mails normalizados (minúsculas, sem espaço). */
export function parsePlatformAdminEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Lista efetiva do ambiente atual. Lida a cada chamada: é env var, custo desprezível. */
export function platformAdminEmails(): string[] {
  return parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS);
}

/** true se o e-mail consta na lista. Comparação exata, sem caixa; lista vazia nunca casa. */
export function isPlatformAdminEmail(email: string | undefined | null): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return platformAdminEmails().includes(normalized);
}
