import { cookies } from "next/headers";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function POST(req: Request) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalido." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!name || !email || password.length < 6) {
    return Response.json({ error: "Informe nome, e-mail e senha com no minimo 6 caracteres." }, { status: 400 });
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "E-mail invalido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createError || !created.user) {
    if (createError?.message.toLowerCase().includes("already")) {
      return Response.json({ error: "E-mail ja cadastrado." }, { status: 409 });
    }
    return Response.json({ error: createError?.message ?? "Nao foi possivel criar usuario." }, { status: 400 });
  }

  const authUserId = created.user.id;
  const slug = `${toSlug(name) || "tenant"}-${authUserId.slice(0, 8)}`;

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .insert({ name, slug, created_by: authUserId })
    .select("id")
    .single();

  if (orgError || !organization) {
    await supabase.auth.admin.deleteUser(authUserId);
    return Response.json({ error: orgError?.message ?? "Nao foi possivel criar organizacao." }, { status: 500 });
  }

  const tenantId = String(organization.id);

  const { error: profileError } = await supabase.from("users").insert({
    tenant_id: tenantId,
    auth_user_id: authUserId,
    name,
    email,
  });

  if (profileError) return Response.json({ error: profileError.message }, { status: 500 });

  const { error: membershipError } = await supabase.from("memberships").insert({
    tenant_id: tenantId,
    user_id: authUserId,
    role: "owner",
    accepted_at: new Date().toISOString(),
  });

  if (membershipError) return Response.json({ error: membershipError.message }, { status: 500 });

  const { data: freePlan } = await supabase.from("plans").select("id").eq("code", "FREE").maybeSingle();
  if (freePlan?.id) {
    await supabase.from("subscriptions").insert({
      tenant_id: tenantId,
      plan_id: freePlan.id,
      status: "free",
      metadata: { source: "signup" },
    });
  }

  const { data: sessionData } = await supabase.auth.signInWithPassword({ email, password });
  const token = await signSession(authUserId);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);

  return Response.json(
    {
      id: authUserId,
      name,
      email,
      tenantId,
      accessToken: sessionData.session?.access_token ?? null,
      refreshToken: sessionData.session?.refresh_token ?? null,
    },
    { status: 201 },
  );
}

