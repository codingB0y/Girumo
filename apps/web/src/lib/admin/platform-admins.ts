/**
 * Quem é super-admin da plataforma, lido da tabela `platform_admins` por
 * `auth_user_id`.
 *
 * O critério era o e-mail (`PLATFORM_ADMIN_EMAILS`). Não dá: o signup cria conta
 * com `email_confirm: true` sem verificar posse do endereço, então um e-mail da
 * allowlist ainda não cadastrado podia ser reivindicado por quem registrasse
 * primeiro — e virava super-admin. O `auth_user_id` só existe depois que a conta
 * existe e não é adivinhável.
 *
 * Este módulo NÃO importa `server-only` de propósito: a decisão de acesso é a
 * parte que merece teste, e `admin-guard.ts` (que importa `server-only`) não roda
 * sob `tsx --test`. Aqui fica a decisão pura; lá fica a chamada ao Supabase.
 */

/** Resposta crua do PostgREST que a decisão consome. */
export type AdminQueryResult = {
  data: unknown;
  error: unknown;
};

/**
 * Decide o acesso a partir da resposta da consulta.
 *
 * Fail-closed em duas frentes: erro nega (tabela ausente, blip de rede, permissão)
 * e ausência de linha nega. Só `error` nulo E linha presente libera — nesta ordem,
 * porque o PostgREST pode devolver `data` residual junto de `error`.
 */
export function isAdminFromQuery(result: AdminQueryResult): boolean {
  if (result.error) return false;
  return result.data !== null && result.data !== undefined;
}

/** Um super-admin como o resto do app o lê. */
export type PlatformAdmin = {
  authUserId: string;
  email: string | null;
  note: string | null;
};

type PlatformAdminRow = {
  auth_user_id?: unknown;
  email?: unknown;
  note?: unknown;
};

/**
 * Normaliza as linhas da tabela para leitura na tela.
 *
 * Fail-closed também aqui: erro devolve lista vazia em vez de estourar, e linha
 * sem `auth_user_id` é descartada — uma entrada que não identifica ninguém não
 * pode aparecer como admin numa lista de auditoria.
 */
export function normalizePlatformAdmins(result: {
  data: unknown;
  error: unknown;
}): PlatformAdmin[] {
  if (result.error || !Array.isArray(result.data)) return [];

  return (result.data as PlatformAdminRow[])
    .filter((row): row is PlatformAdminRow => typeof row?.auth_user_id === "string")
    .map((row) => ({
      authUserId: row.auth_user_id as string,
      email: typeof row.email === "string" ? row.email : null,
      note: typeof row.note === "string" ? row.note : null,
    }));
}
