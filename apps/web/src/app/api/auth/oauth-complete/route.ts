import { cookies } from "next/headers";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth";
import { buildTenantSlug, resolveDisplayName } from "@/lib/auth/oauth-account";
import { selectPendingInvite } from "@/lib/auth/pending-invite";
import { getAppUrl } from "@/lib/environment";
import { getSupabaseAdmin, getSupabaseServerAnon } from "@/lib/supabase/server";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fecha o login social. O browser ja trocou o consentimento do Google por uma
 * sessao Supabase e manda o access token aqui; validamos o token, garantimos
 * org/membership no primeiro acesso e emitimos o cookie `dz_session`.
 *
 * O consentimento acontece no CLIENTE, nao aqui: o supabase-js roda em
 * `flowType: "implicit"` (default do auth-js), e nesse fluxo os tokens voltam
 * no fragmento da URL — que nunca chega ao servidor. Um callback server-side
 * jamais veria o `?code=`, e por isso o desenho anterior nao completava.
 */
export async function POST(req: Request) {
  const bearer = req.headers.get("authorization");
  const accessToken = bearer?.toLowerCase().startsWith("bearer ")
    ? bearer.slice(7).trim()
    : "";

  if (!accessToken) {
    return Response.json({ error: "Token de acesso ausente." }, { status: 401 });
  }

  const { data: userData, error: userError } = await getSupabaseServerAnon().auth.getUser(
    accessToken,
  );

  if (userError || !userData.user) {
    return Response.json({ error: "Sessao invalida ou expirada." }, { status: 401 });
  }

  const authUser = userData.user;
  const email = authUser.email ?? null;
  const supabase = getSupabaseAdmin();

  const { data: membership, error: membershipLookupError } = await supabase
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", authUser.id)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipLookupError) {
    return Response.json(
      { error: "Nao foi possivel carregar sua conta. Tente de novo." },
      { status: 500 },
    );
  }

  // Conta ja provisionada: so renova o cookie de compatibilidade.
  if (membership?.tenant_id) {
    await setSessionCookie(authUser.id);
    return Response.json({
      id: authUser.id,
      email,
      tenantId: String(membership.tenant_id),
      role: membership.role ?? null,
      created: false,
    });
  }

  // Antes de tratar como primeiro acesso: este e-mail foi convidado para algum
  // tenant? A membership do convite tem `user_id` nulo, então a busca acima (por
  // `user_id`) não a enxerga. Sem este passo, o convidado ganharia uma org nova
  // e o convite ficaria pendurado para sempre — o "tenant fantasma".
  if (email) {
    const invitedName = resolveDisplayName({
      fullName: typeof authUser.user_metadata?.full_name === "string" ? authUser.user_metadata.full_name : null,
      name: typeof authUser.user_metadata?.name === "string" ? authUser.user_metadata.name : null,
      email,
    });
    const invite = await acceptPendingInvite(supabase, authUser.id, email, invitedName);
    if (invite) {
      await setSessionCookie(authUser.id);
      return Response.json({
        id: authUser.id,
        email,
        tenantId: invite.tenant_id,
        role: invite.role,
        created: false,
        joinedViaInvite: true,
      });
    }
  }

  // Primeiro acesso via Google — provisiona org, perfil, membership e plano.
  const name = resolveDisplayName({
    fullName: typeof authUser.user_metadata?.full_name === "string" ? authUser.user_metadata.full_name : null,
    name: typeof authUser.user_metadata?.name === "string" ? authUser.user_metadata.name : null,
    email,
  });
  const slug = buildTenantSlug(name, authUser.id);

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .insert({ name, slug, created_by: authUser.id })
    .select("id")
    .single();

  // Sem tenant nao existe conta usavel: falha explicita e SEM cookie, para a
  // proxima tentativa reprovisionar em vez de largar o usuario num painel vazio.
  if (orgError || !organization) {
    return Response.json(
      { error: orgError?.message ?? "Nao foi possivel criar sua organizacao." },
      { status: 500 },
    );
  }

  const tenantId = String(organization.id);

  const { error: profileError } = await supabase.from("users").insert({
    tenant_id: tenantId,
    auth_user_id: authUser.id,
    name,
    email,
  });

  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 500 });
  }

  const { error: membershipError } = await supabase.from("memberships").insert({
    tenant_id: tenantId,
    user_id: authUser.id,
    role: "owner",
    accepted_at: new Date().toISOString(),
  });

  if (membershipError) {
    return Response.json({ error: membershipError.message }, { status: 500 });
  }

  const { data: freePlan } = await supabase
    .from("plans")
    .select("id")
    .eq("code", "FREE")
    .maybeSingle();

  if (freePlan?.id) {
    await supabase.from("subscriptions").insert({
      tenant_id: tenantId,
      plan_id: freePlan.id,
      status: "free",
      metadata: { source: "google_oauth" },
    });
  }

  await setSessionCookie(authUser.id);

  // Mesmo funil do cadastro por e-mail: sem isto, signup via Google fica
  // invisivel no relatorio. Nao bloqueia a resposta.
  trackFunnelEvent({
    tenantId,
    userId: authUser.id,
    event: "signup",
    metadata: { source: "google_oauth" },
  });

  if (email) {
    const appUrl = getAppUrl();
    const { subject, html } = welcomeEmail(name, appUrl);
    sendEmail({ to: email, subject, html });
  }

  return Response.json(
    { id: authUser.id, name, email, tenantId, role: "owner", created: true },
    { status: 201 },
  );
}

async function setSessionCookie(authUserId: string): Promise<void> {
  const token = await signSession(authUserId);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

/**
 * Vincula o usuário ao convite pendente do seu e-mail, se houver, e devolve o
 * tenant do convite. Retorna null quando não há convite — aí o chamador segue
 * para o provisionamento de conta nova.
 *
 * O `update` filtra `user_id is null` para não reatribuir um convite que outro
 * login concorrente já aceitou; se esse filtro zerar as linhas, tratamos como
 * "sem convite" e caímos no fluxo de conta nova, nunca num tenant errado.
 */
async function acceptPendingInvite(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  authUserId: string,
  email: string,
  displayName: string,
): Promise<{ tenant_id: string; role: string | null } | null> {
  const { data: pending, error } = await supabase
    .from("memberships")
    .select("id, tenant_id, role, invited_email, created_at")
    .is("user_id", null)
    .is("accepted_at", null)
    .ilike("invited_email", email)
    .order("created_at", { ascending: true });

  if (error || !pending?.length) return null;

  const invite = selectPendingInvite(pending, email);
  if (!invite) return null;

  const { data: claimed, error: claimError } = await supabase
    .from("memberships")
    .update({ user_id: authUserId, accepted_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("user_id", null)
    .select("id")
    .maybeSingle();

  // Update não pegou linha: uma request concorrente do mesmo usuário já vinculou
  // este convite. Relê e, se a membership ficou com este `authUserId`, devolve o
  // tenant dela — nunca cai em criar org, que geraria o tenant fantasma.
  if (claimError || !claimed) {
    const { data: settled } = await supabase
      .from("memberships")
      .select("tenant_id, role")
      .eq("id", invite.id)
      .eq("user_id", authUserId)
      .maybeSingle();
    if (!settled) return null;
    return { tenant_id: String(settled.tenant_id), role: settled.role ?? null };
  }

  const tenantId = String(invite.tenant_id);

  await supabase.from("users").upsert(
    { tenant_id: tenantId, auth_user_id: authUserId, name: displayName, email },
    { onConflict: "tenant_id,auth_user_id" },
  );

  await supabase.from("logs").insert({
    tenant_id: tenantId,
    actor_user_id: authUserId,
    level: "info",
    event: "membership.accepted",
    message: `Convite aceito por ${email} no primeiro login via Google.`,
    metadata: { membership_id: invite.id, role: invite.role, source: "google_oauth" },
  });

  return { tenant_id: tenantId, role: invite.role };
}
