import { cookies } from "next/headers";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth";
import { MENSAGEM_DE_LIMITE, tipoDaFalhaDeLogin } from "@/lib/auth/erros-do-auth";
import { createSupabaseAnonClient, getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalido." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return Response.json({ error: "Informe e-mail e senha." }, { status: 400 });
  }

  // Cliente descartável: o singleton anon é compartilhado entre requisições e
  // guardaria na memória a sessão deste login.
  const auth = createSupabaseAnonClient();
  const { data, error } = await auth.auth.signInWithPassword({ email, password });

  if (error) {
    const tipo = tipoDaFalhaDeLogin(error);
    if (tipo === "limite") return Response.json({ error: MENSAGEM_DE_LIMITE }, { status: 429 });
    if (tipo === "indisponivel") {
      console.error("[auth] login: Supabase Auth falhou:", error.status, error.code ?? error.message);
      return Response.json({ error: "Não foi possível entrar agora. Tente de novo em instantes." }, { status: 503 });
    }
  }
  if (error || !data.user || !data.session) {
    return Response.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: membership } = await supabase
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", data.user.id)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const token = await signSession(data.user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);

  return Response.json({
    id: data.user.id,
    name: data.user.user_metadata?.name ?? null,
    email: data.user.email,
    tenantId: membership?.tenant_id ?? null,
    role: membership?.role ?? null,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
}
