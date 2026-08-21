// Auth legado leve, sem dependencias e compativel com Edge/Node.
// Ponte de compatibilidade: o cookie carrega auth.users.id enquanto
// Supabase Auth vira a sessao principal.
import { resolveSecret } from "./runtime-secrets";

export const SESSION_COOKIE = "dz_session";

// Fail-closed: sem ENGINE_TOKEN na env, nenhuma request da engine autentica
// (string vazia nunca casa com header). Não há mais default conhecido de dev —
// configure no .env.local com o mesmo valor usado pela engine. Produção real
// continua fail-fast no boot via instrumentation.ts. Remove na F5 (cutover Evolution).
export const ENGINE_TOKEN = process.env.ENGINE_TOKEN?.trim() ?? "";
const AUTH_SECRET = resolveSecret(
  "AUTH_SECRET",
  process.env.AUTH_SECRET,
  process.env.NODE_ENV,
  "dz-dev-secret-troque-em-producao",
);
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 dias

const enc = new TextEncoder();

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacHex(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gera um cookie de sessao assinado para compatibilidade (sub = authUserId). */
export async function signSession(authUserId: string): Promise<string> {
  const payload = b64url(JSON.stringify({ sub: authUserId, iat: Date.now() }));
  const sig = await hmacHex(payload);
  return `${payload}.${sig}`;
}

/** Sessão válida: quem é, e quando o cookie foi emitido. */
export type SessionClaims = {
  authUserId: string;
  /** `iat` em ms. Comparado com `session_revocations.revoked_before`. */
  issuedAt: number;
};

/**
 * Valida o cookie (assinatura + validade) e devolve as claims, ou null.
 * Edge-safe: não toca no banco.
 *
 * A revogação NÃO é checada aqui de propósito — exige uma consulta, e isto roda
 * no middleware (Edge). Quem tem banco chama `assertSessionNotRevoked`; ver
 * `lib/auth/session-revocation.ts`.
 */
export async function parseSession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmacHex(payload);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const issuedAt = typeof json.iat === "number" ? json.iat : 0;
    if (Date.now() - issuedAt >= MAX_AGE_S * 1000) return null;
    return typeof json.sub === "string" ? { authUserId: json.sub, issuedAt } : null;
  } catch {
    return null;
  }
}

/** Valida o cookie e devolve só o authUserId, ou null. Edge-safe. */
export async function verifySession(token: string | undefined | null): Promise<string | null> {
  return (await parseSession(token))?.authUserId ?? null;
}

/** Assina um payload de impersonation (mesmo esquema HMAC do dz_session). */
export async function signImpersonate(data: Record<string, unknown>): Promise<string> {
  const payload = b64url(JSON.stringify(data));
  const sig = await hmacHex(payload);
  return `${payload}.${sig}`;
}

/** Verifica a assinatura do cookie de impersonation e devolve o payload, ou null. Edge-safe. */
export async function verifyImpersonate<T>(token: string | undefined | null): Promise<T | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmacHex(payload);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as T;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_S,
  secure: process.env.NODE_ENV === "production",
};
