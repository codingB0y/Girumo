// Auth legado leve, sem dependencias e compativel com Edge/Node.
// Ponte de compatibilidade: o cookie carrega auth.users.id enquanto
// Supabase Auth vira a sessao principal.

export const SESSION_COOKIE = "dz_session";

// Defaults p/ rodar sem configurar nada; troque via env em produção.
export const ENGINE_TOKEN = process.env.ENGINE_TOKEN ?? "dz_dev_engine_token";
const AUTH_SECRET = process.env.AUTH_SECRET ?? "dz-dev-secret-troque-em-producao";
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

/** Valida o cookie (assinatura + validade) e devolve o authUserId, ou null. Edge-safe. */
export async function verifySession(token: string | undefined | null): Promise<string | null> {
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
    if (Date.now() - (json.iat ?? 0) >= MAX_AGE_S * 1000) return null;
    return typeof json.sub === "string" ? json.sub : null;
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
