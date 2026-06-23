import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/login — { email, password } → valida e seta cookie de sessão da conta.
export async function POST(req: Request) {
  let b: { email?: string; password?: string };
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  if (!email || !password) {
    return Response.json({ error: "Informe e-mail e senha." }, { status: 400 });
  }
  const account = await prisma.account.findUnique({ where: { email } });
  if (!account || !(await bcrypt.compare(password, account.passwordHash))) {
    return Response.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }
  if (account.status === "CANCELED") {
    return Response.json({ error: "Conta cancelada." }, { status: 403 });
  }
  const token = await signSession(account.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  return Response.json({ id: account.id, name: account.name, email: account.email });
}
