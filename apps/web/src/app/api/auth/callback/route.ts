import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth";
import { getSupabaseAdmin, getSupabaseServerAnon } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Callback OAuth — Supabase redireciona para cá após consentimento do Google.
 * Troca o code por sessão, cria org/membership se for primeiro acesso, e redireciona.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/painel";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", url.origin));
  }

  const supabase = getSupabaseServerAnon();
  const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !exchangeData.session || !exchangeData.user) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", url.origin));
  }

  const user = exchangeData.user;
  const admin = getSupabaseAdmin();

  // Verifica se já tem membership
  const { data: membership } = await admin
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let tenantId = membership?.tenant_id ?? null;
  let destination = next;

  // Primeiro acesso — criar org e membership
  if (!tenantId) {
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Usuário";
    const slug = toSlug(name) + "-" + user.id.slice(0, 8);

    const { data: org } = await admin
      .from("organizations")
      .insert({ name, slug, created_by: user.id })
      .select("id")
      .single();

    if (org) {
      tenantId = String(org.id);

      await admin.from("users").insert({
        tenant_id: tenantId,
        auth_user_id: user.id,
        name,
        email: user.email,
      });

      await admin.from("memberships").insert({
        tenant_id: tenantId,
        user_id: user.id,
        role: "owner",
        accepted_at: new Date().toISOString(),
      });

      // Assign free plan
      const { data: freePlan } = await admin.from("plans").select("id").eq("code", "FREE").maybeSingle();
      if (freePlan?.id) {
        await admin.from("subscriptions").insert({
          tenant_id: tenantId,
          plan_id: freePlan.id,
          status: "free",
          metadata: { source: "google_oauth" },
        });
      }

      // Novo usuário → painel atual
      destination = "/painel";
    }
  }

  // Setar cookie de sessão
  const token = await signSession(user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);

  return NextResponse.redirect(new URL(destination, url.origin));
}

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
