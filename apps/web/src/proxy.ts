import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, ENGINE_TOKEN, verifySession } from "@/lib/auth";

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
  return ENGINE_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/") return NextResponse.next();

  if (pathname === "/api/health") return NextResponse.next();

  if (pathname === "/api/billing/webhook") return NextResponse.next();

  if (isEngineRoute(pathname)) {
    const token = req.headers.get("x-engine-token");
    if (token && token === ENGINE_TOKEN) return NextResponse.next();
  }

  const bearer = req.headers.get("authorization");
  if (pathname.startsWith("/api/") && bearer?.toLowerCase().startsWith("bearer ")) {
    return NextResponse.next();
  }

  const authed = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (authed) return NextResponse.next();
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|signup|forgot-password|reset-password|api/auth|r/|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
