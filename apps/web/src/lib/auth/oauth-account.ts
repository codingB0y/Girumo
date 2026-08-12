/**
 * Helpers puros do provisionamento de conta via login social.
 *
 * Vive fora de `lib/supabase/*` de proposito: aquele modulo e `server-only` e
 * nao carrega sob `tsx --test`. Aqui fica so logica sem I/O, testavel direto.
 */

const SLUG_MAX_LENGTH = 48;
const USER_ID_SUFFIX_LENGTH = 8;
const DEFAULT_NAME = "Usuario";
const DEFAULT_SLUG_BASE = "tenant";
const DEFAULT_NEXT_PATH = "/painel";

export interface OAuthIdentity {
  fullName?: string | null;
  name?: string | null;
  email?: string | null;
}

/** Normaliza texto livre em slug de organizacao. */
export function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}

/**
 * Nome de exibicao do usuario: metadata do provedor primeiro, depois o usuario
 * do e-mail, e um fallback generico por ultimo. O Google manda `full_name` na
 * maioria dos casos e `name` em contas antigas.
 */
export function resolveDisplayName(identity: OAuthIdentity): string {
  const fullName = identity.fullName?.trim();
  if (fullName) return fullName;

  const name = identity.name?.trim();
  if (name) return name;

  const emailUser = identity.email?.split("@")[0]?.trim();
  if (emailUser) return emailUser;

  return DEFAULT_NAME;
}

/**
 * Slug do tenant: base legivel + prefixo do auth user id. O sufixo evita
 * colisao entre dois usuarios com o mesmo nome, que o Google permite.
 */
export function buildTenantSlug(name: string, authUserId: string): string {
  const base = toSlug(name) || DEFAULT_SLUG_BASE;
  return `${base}-${authUserId.slice(0, USER_ID_SUFFIX_LENGTH)}`;
}

/**
 * Destino pos-login. Aceita somente caminho interno — qualquer coisa que o
 * browser possa ler como host externo cai no painel. Barra open redirect.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return DEFAULT_NEXT_PATH;
  if (!value.startsWith("/")) return DEFAULT_NEXT_PATH;
  // `//host` e `/\host` sao protocol-relative: saem do dominio.
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_NEXT_PATH;
  return value;
}
