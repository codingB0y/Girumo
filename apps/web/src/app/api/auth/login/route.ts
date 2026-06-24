import { cookies } from "next/headers";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

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

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user || !data.session) {
    return Response.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }

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

