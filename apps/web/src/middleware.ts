import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SESSION_COOKIE, ENGINE_TOKEN, verifySession } from "@/lib/auth";
import { classifyRequest, decideEngineAccess } from "@/lib/security/request-access-policy";

const RATE_LIMIT_WINDOW = 60_000; // 1 minuto
const RATE_LIMITS: Record<string, number> = {
  "/api/auth/login": 5,
  "/api/auth/signup": 3,
  "/api/auth/account": 10,
  // Webhooks de provedor: teto alto porque uma instância ativa emite rajadas
  // legítimas (QR renova a cada ~20s, grupos grandes disparam em lote). O gate
  // de verdade é o secret no handler; isto só barra flood ingênuo.
  // Limitação conhecida: o contador é por instância serverless, então na Vercel
  // o teto efetivo é maior que 300. Aceito na F2.
  "/api/webhooks/evolution": 300,
};

const ipAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string, path: string): boolean {
  const limit = Object.entries(RATE_LIMITS).find(([route]) => path.startsWith(route));
  if (!limit) return false;

  const maxAttempts = limit[1];
  const key = `${ip}:${limit[0]}`;
  const now = Date.now();
  const entry = ipAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    ipAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  if (entry.count > maxAttempts) return true;
  return false;
}

async function validateBearerToken(token: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return false;

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    return !error && !!data.user;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const accessKind = classifyRequest(pathname, req.method);

  // Public routes
  if (pathname === "/") return NextResponse.next();
  if (pathname === "/api/health") return NextResponse.next();
  if (pathname === "/api/billing/webhook") return NextResponse.next();
  if (pathname.startsWith("/posts/og")) return NextResponse.next();

  // Provider webhooks carry no session: the handler authenticates them with a
  // constant-time secret compare. Rate limited here so an unauthenticated
  // flood never reaches the database.
  if (accessKind === "webhook") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip, pathname)) {
      return NextResponse.json({ error: "rate limited" }, { status: 429 });
    }
    return NextResponse.next();
  }

  // Crons and public auth callbacks authenticate inside their route handlers.
  if (accessKind === "cron" || (accessKind === "public" && pathname.startsWith("/api/"))) {
    return NextResponse.next();
  }

  // Public auth mutations are rate-limited before reaching their handlers.
  if (accessKind === "auth-rate-limited") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip, pathname)) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde 1 minuto." },
        { status: 429 },
      );
    }
    return NextResponse.next();
  }

  // Engine credentials are fail-closed. Invalid tokens never fall back to user auth.
  if (accessKind === "engine-only" || accessKind === "shared") {
    const decision = decideEngineAccess(
      accessKind,
      req.headers.get("x-engine-token"),
      ENGINE_TOKEN,
    );
    if (decision === "allow-engine") return NextResponse.next();
    if (decision === "reject-401") {
      return NextResponse.json({ error: "Token da engine inválido." }, { status: 401 });
    }
    if (decision === "reject-403") {
      return NextResponse.json({ error: "Rota exclusiva da engine." }, { status: 403 });
    }
  }

  // Bearer token validation (Supabase Auth)
  const bearer = req.headers.get("authorization");
  if (pathname.startsWith("/api/") && bearer?.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7);
    const valid = await validateBearerToken(token);
    if (valid) return NextResponse.next();
    return NextResponse.json({ error: "Token invalido." }, { status: 401 });
  }

  // Session cookie validation
  const authed = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (authed) return NextResponse.next();
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  // Page routes: redirect to login if not authed
  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // p/ = LPs públicas do Flow Pages · api/p/ = endpoints públicos do Flow Pages
  // (rate-limit próprio nas rotas públicas de lead/track — sessão 4)
  // lp = landing experimental de conversão (/lp) — pública, sem sessão
  matcher: ["/((?!login|signup|forgot-password|reset-password|api/p/|r/|p/|lp|_next/static|_next/image|favicon.ico|.*\\.).*)"]
};
