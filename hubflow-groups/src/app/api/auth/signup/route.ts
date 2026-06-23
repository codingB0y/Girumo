import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/signup — { name, email, password } → cria conta e já loga.
export async function POST(req: Request) {
  let b: { name?: string; email?: string; password?: string };
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  if (!name || !email || password.length < 6) {
    return Response.json({ error: "Informe nome, e-mail e senha (mín. 6 caracteres)." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (await prisma.account.findUnique({ where: { email } })) {
    return Response.json({ error: "E-mail já cadastrado." }, { status: 409 });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const account = await prisma.account.create({ data: { name, email, passwordHash } });
  const token = await signSession(account.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  return Response.json({ id: account.id, name: account.name, email: account.email }, { status: 201 });
}
