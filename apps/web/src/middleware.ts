import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SESSION_COOKIE, ENGINE_TOKEN, verifySession } from "@/lib/auth";
import { classifyRequest, decideEngineAccess } from "@/lib/security/request-access-policy";
import { buildCsp, generateNonce, surfaceForPath } from "@/lib/security/csp";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isPublicPage, publicPageCaseAlias } from "@/lib/public-pages";
import {
  customHostRoute,
  hostnameFromHostHeader,
  isFirstPartyHost,
  skipsFirstPartyMiddleware,
} from "@/lib/custom-domains/host";

const RATE_LIMIT_WINDOW = 60_000; // 1 minuto
const RATE_LIMITS: Record<string, number> = {
  "/api/auth/login": 5,
  "/api/auth/signup": 3,
  "/api/auth/account": 10,
  // Fecha o login social: autentica pelo Bearer no handler, então precisa de
  // teto próprio para não virar oráculo de validação de token.
  "/api/auth/oauth-complete": 10,
  // Webhooks de provedor: teto alto porque uma instância ativa emite rajadas
  // legítimas (QR renova a cada ~20s, grupos grandes disparam em lote). O gate
  // de verdade é o secret no handler; isto só barra flood ingênuo.
  // Limitação conhecida: o contador é por instância serverless, então na Vercel
  // o teto efetivo é maior que 300. Aceito na F2.
  "/api/webhooks/evolution": 300,
  // Beacon de clique de saída (wa.me) na landing. Teto folgado porque é UM
  // request por clique e uma pessoa lendo a página clica poucas vezes; o
  // handler ainda aplica o seu próprio teto por IP.
  //
  // A entrada é OBRIGATÓRIA para toda rota `public-rate-limited`, não
  // decorativa: `isRateLimited` faz `Object.entries(RATE_LIMITS).find(...)` e
  // devolve `false` quando não acha o path. Sem a linha, o branch lá embaixo
  // roda e nunca limita nada — fail-open.
  "/api/track/outbound": 30,
};

async function isRateLimited(ip: string, path: string): Promise<boolean> {
  const limit = Object.entries(RATE_LIMITS).find(([route]) => path.startsWith(route));
  if (!limit) return false;
  const [route, maxAttempts] = limit;
  // Distribuído (Upstash) quando configurado; senão in-memory por instância.
  return checkRateLimit(`${ip}:${route}`, maxAttempts, RATE_LIMIT_WINDOW);
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

/**
 * Superfícies públicas com CSP nonce-ada (M5). São rotas SEM sessão: entram no
 * matcher só pra ganhar o header, e precisam sair ANTES do gate de auth — se
 * caíssem nele, /p/:slug e /r/:slug redirecionariam pro login.
 *
 * O nonce viaja em dois lugares: no header `content-security-policy` da REQUEST,
 * que é de onde o Next lê pra assinar os próprios scripts inline, e em `x-nonce`,
 * que a page e o route handler leem pra assinar os scripts que eles mesmos criam.
 */
function nonceResponse(req: NextRequest, csp: string, nonce: string, rewriteTo?: URL): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-nonce", nonce);
  const init = { request: { headers: requestHeaders } };
  const res = rewriteTo ? NextResponse.rewrite(rewriteTo, init) : NextResponse.next(init);
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

/**
 * `/<slug>` no domínio do lojista: serve `/r/<slug>` sem mudar a URL do
 * visitante. Mesma CSP com nonce do /r/ (a tela de entrada tem script inline).
 */
function rootLinkResponse(req: NextRequest): NextResponse {
  const nonce = generateNonce();
  const destino = req.nextUrl.clone();
  destino.pathname = `/r${req.nextUrl.pathname}`;
  return nonceResponse(req, buildCsp("click-redirect", nonce, process.env.NODE_ENV === "development"), nonce, destino);
}

/** 404 seco no domínio do lojista: lá não existe painel, login nem API logada. */
function customHostNotFound(): NextResponse {
  return new NextResponse("Link não encontrado.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // O host vem do header `Host` (a mesma fonte que o `missing` do matcher
  // compara), não de `nextUrl`.
  const firstParty = isFirstPartyHost(hostnameFromHostHeader(req.headers.get("host")));
  // Caminhos que a primeira entrada do matcher exclui: em host do Girumo passam
  // direto, mesmo que a plataforma rode o middleware neles (ver host.ts).
  if (firstParty && skipsFirstPartyMiddleware(pathname)) return NextResponse.next();

  // Domínio próprio do lojista: só links e páginas. A checagem de que o link é
  // do DONO do domínio fica no handler, que tem acesso ao banco — aqui só se
  // decide o que pode existir nesse endereço.
  if (!firstParty) {
    const route = customHostRoute(pathname);
    if (route === "not-found") return customHostNotFound();
    // /api/p/* em host do Girumo nem passa pelo middleware (fora do matcher).
    if (route === "public-api") return NextResponse.next();
    if (route === "root-link") return rootLinkResponse(req);
    // "surface" (/r, /c, /p) segue o fluxo de sempre: CSP com nonce logo abaixo.
  }

  const nonceSurface = surfaceForPath(pathname);
  if (nonceSurface) {
    const nonce = generateNonce();
    return nonceResponse(
      req,
      buildCsp(nonceSurface, nonce, process.env.NODE_ENV === "development"),
      nonce,
    );
  }

  const accessKind = classifyRequest(pathname, req.method);

  // Página pública digitada com outra caixa ("/44ebras"): 308 até a grafia
  // certa, antes do gate — senão vira 307 para o login. O clone mantém a query:
  // o anúncio chega com utm_*, e perder isso apaga a origem do lead. Por que
  // não é `redirects()` do next.config está em `publicPageCaseAlias`.
  const caseAlias = publicPageCaseAlias(pathname);
  if (caseAlias) {
    const url = req.nextUrl.clone();
    url.pathname = caseAlias;
    return NextResponse.redirect(url, 308);
  }

  // Páginas públicas. A lista mora em `lib/public-pages` porque o middleware
  // não roda sob `tsx --test` — de lá ela é testável de verdade, em vez de por
  // casamento de string no arquivo-fonte. Inclui os documentos legais, que
  // precisam abrir para quem ainda NÃO tem conta e para o robô de verificação
  // do Stripe; fora da lista o gate de auth responde 307 para o login, que foi
  // o estado até 26/08.
  if (isPublicPage(pathname)) return NextResponse.next();
  if (pathname === "/api/health") return NextResponse.next();
  if (pathname === "/api/billing/webhook") return NextResponse.next();
  if (pathname.startsWith("/posts/og")) return NextResponse.next();

  // Provider webhooks carry no session: the handler authenticates them with a
  // constant-time secret compare. Rate limited here so an unauthenticated
  // flood never reaches the database.
  if (accessKind === "webhook") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (await isRateLimited(ip, pathname)) {
      return NextResponse.json({ error: "rate limited" }, { status: 429 });
    }
    return NextResponse.next();
  }

  // Crons and public auth callbacks authenticate inside their route handlers.
  if (accessKind === "cron" || (accessKind === "public" && pathname.startsWith("/api/"))) {
    return NextResponse.next();
  }

  // Public auth mutations are rate-limited before reaching their handlers.
  if (accessKind === "auth-rate-limited" || accessKind === "public-rate-limited") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (await isRateLimited(ip, pathname)) {
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
  // api/p/ = endpoints públicos do Flow Pages (rate-limit próprio nas rotas
  // públicas de lead/track — sessão 4)
  // lp = landing experimental de conversão (/lp) — pública, sem sessão
  //
  // As duas entradas dedicadas de /p/ e /r/ existem porque a regra geral exclui
  // QUALQUER path com ponto (`.*\.`, pra não rodar em asset), e sem elas
  // `/p/foo.bar` sairia SEM CSP nenhuma — falha aberta. Entradas próprias
  // garantem que toda request dessas superfícies recebe a política, inclusive
  // as que terminam em 404. surfaceForPath as tira do fluxo de auth logo na
  // primeira linha do middleware, antes de qualquer verificação de sessão.
  matcher: [
    "/((?!login|signup|forgot-password|reset-password|auth/callback|api/p/|lp|_next/static|_next/image|favicon.ico|.*\\.).*)",
    "/p/:path*",
    "/r/:path*",
    "/c/:path*",
    // Domínio próprio do lojista: o middleware roda em TODO path de host que
    // não é do Girumo — inclusive os que a primeira entrada exclui (/login,
    // /api/p/...) — para o ramo de host de lojista barrar o que não é link nem
    // página. O `value` é o FIRST_PARTY_HOST_PATTERN literal (o Next exige
    // config estática aqui); host.test.ts trava os dois iguais. Assets
    // (`_next/*`, arquivos com ponto) ficam de fora: as LPs precisam deles.
    {
      source: "/((?!_next/static|_next/image|.*\\.).*)",
      missing: [
        {
          type: "host",
          value: "(?:localhost|\\d{1,3}(?:\\.\\d{1,3}){3}|(?:[a-z0-9-]+\\.)*(?:girumo\\.com\\.br|hubflow\\.com\\.br|vercel\\.app|localhost))",
        },
      ],
    },
  ],
};
