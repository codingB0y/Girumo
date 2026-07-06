import { randomBytes } from "crypto";

/**
 * Slug público da LP: {nome-normalizado}-{sufixo aleatório 4 chars}.
 * O sufixo evita squatting entre tenants e enumeração por scraper
 * (decisão da Sessão 0 — slug UNIQUE é global).
 */

const RESERVED = new Set([
  "admin", "api", "painel", "login", "signup", "app", "www", "hubflow",
  "whatsapp", "oficial", "suporte", "ajuda", "billing", "checkout",
]);

const SUFFIX_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // sem 0/O/1/l/i

export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `pagina${base ? `-${base}` : ""}`;
}

export function randomSuffix(length = 4): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SUFFIX_ALPHABET[bytes[i] % SUFFIX_ALPHABET.length];
  }
  return out;
}

/** Gera candidato de slug único. Colisão residual é resolvida por retry no store. */
export function generateSlug(storeName: string): string {
  let base = slugify(storeName);
  if (RESERVED.has(base)) base = `loja-${base}`;
  return `${base}-${randomSuffix()}`;
}
