export type AccessKind =
  | "public"
  | "auth-rate-limited"
  | "cron"
  | "engine-only"
  | "shared"
  | "user";

export type EngineDecision =
  | "allow-engine"
  | "continue-user"
  | "reject-401"
  | "reject-403";

const ENGINE_ONLY = new Set([
  "POST /api/session",
  "POST /api/groups",
  "POST /api/leads",
  "POST /api/activity",
  "POST /api/dispatch/pending",
  "POST /api/dispatch/ack",
  "POST /api/groups/grow/pending",
  "POST /api/groups/grow/ack",
]);

const SHARED_PREFIXES = [
  "/api/session",
  "/api/groups",
  "/api/leads",
  "/api/welcome",
  "/api/optout",
  "/api/media",
];

export function classifyRequest(pathname: string, method: string): AccessKind {
  const normalizedMethod = method.toUpperCase();
  const key = `${normalizedMethod} ${pathname}`;

  if (pathname.startsWith("/api/auth/") && normalizedMethod === "POST") {
    return "auth-rate-limited";
  }

  if (pathname.startsWith("/api/auth/")) return "public";

  if (pathname === "/api/cron/emails" || pathname === "/api/notifications/alerts") {
    return "cron";
  }

  if (ENGINE_ONLY.has(key)) return "engine-only";

  if (
    SHARED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return "shared";
  }

  return pathname.startsWith("/api/") ? "user" : "public";
}

export function decideEngineAccess(
  kind: AccessKind,
  token: string | null,
  expectedToken: string,
): EngineDecision {
  if (token) return token === expectedToken ? "allow-engine" : "reject-401";
  if (kind === "engine-only") return "reject-403";
  return "continue-user";
}
