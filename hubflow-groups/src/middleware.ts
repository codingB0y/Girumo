import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, ENGINE_TOKEN, verifySession } from "@/lib/auth";

// Rotas que a ENGINE consome (autenticadas por token, não por cookie de navegador).
const ENGINE_ROUTES = [
  "/api/session",
  "/api/groups",
  "/api/leads",
  "/api/welcome",
  "/api/optout",
  "/api/dispatch/pending",
  "/api/dispatch/ack",
  "/api/activity",
  "/api/media",
];

function isEngineRoute(path: string) {
  return ENGINE_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Landing page pública (marketing) — raiz aberta a todos.
  if (pathname === "/") return NextResponse.next();

  // Engine: aceita se o token bater (mesmas rotas que o navegador usa via cookie).
  if (isEngineRoute(pathname)) {
    const token = req.headers.get("x-engine-token");
    if (token && token === ENGINE_TOKEN) return NextResponse.next();
    // sem token válido cai no fluxo normal (navegador autenticado também pode usar GET).
  }

  const authed = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  // API: 401 limpo (sem redirect) quando não autenticado.
  if (pathname.startsWith("/api/")) {
    if (authed) return NextResponse.next();
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Páginas: manda pro login se não autenticado.
  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Protege tudo, EXCETO: login, cadastro, rotas de auth, link público /r/, e assets estáticos.
export const config = {
  matcher: ["/((?!login|signup|api/auth|r/|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
