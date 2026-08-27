import { cookies } from "next/headers";
import { after } from "next/server";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/auth";
import { acceptPendingInvite } from "@/lib/auth/accept-pending-invite";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { provisionEntrySubscription } from "@/lib/billing/entry-subscription";
import { getAppUrl } from "@/lib/environment";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";
import {
  checkLegalVersion,
  clientIpFromHeaders,
  recordLegalAcceptance,
  userAgentFromHeaders,
} from "@/lib/legal-acceptance";

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
  let body: { name?: string; email?: string; password?: string; legalVersion?: unknown };
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

  // Aceite dos documentos legais, conferido ANTES de tocar no banco: sem
  // consentimento não nasce nem o usuário no auth. O checkbox da tela não
  // participa desta decisão — ele é client-side e some numa chamada direta à
  // API; quem exige o aceite é esta linha.
  const legal = checkLegalVersion(body.legalVersion);
  if (!legal.ok) {
    return Response.json({ error: legal.error, code: legal.code }, { status: legal.status });
  }

  const acceptanceIp = clientIpFromHeaders(req.headers);
  const acceptanceUserAgent = userAgentFromHeaders(req.headers);

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

  // Este e-mail foi convidado para algum tenant? A membership do convite tem
  // `user_id` nulo e casa só pelo `invited_email`, então precisa ser checada
  // ANTES de provisionar org nova — senão o convidado vira dono de um tenant
  // vazio e o convite fica pendurado (o mesmo "tenant fantasma" que o login
  // social tinha). Vale para quem chega pelo link do e-mail de convite.
  const invited = await acceptPendingInvite(supabase, authUserId, email, name);
  if (invited) {
    const acceptanceError = await recordLegalAcceptance(supabase, {
      authUserId,
      tenantId: invited.tenant_id,
      version: legal.version,
      ip: acceptanceIp,
      userAgent: acceptanceUserAgent,
      source: "signup",
    });

    if (acceptanceError) return Response.json({ error: acceptanceError }, { status: 500 });

    const token = await signSession(authUserId);
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
    trackFunnelEvent({
      tenantId: invited.tenant_id,
      userId: authUserId,
      event: "signup",
      metadata: { source: "invite" },
    });
    return Response.json(
      {
        id: authUserId,
        name,
        email,
        tenantId: invited.tenant_id,
        role: invited.role,
        joinedViaInvite: true,
      },
      { status: 201 },
    );
  }

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

  // O aceite falha do mesmo jeito que perfil e membership acima (500), e de
  // propósito: conta que existe sem prova de consentimento é exatamente o
  // estado que este registro veio fechar. Melhor recusar do que provisionar
  // pela metade em silêncio.
  const acceptanceError = await recordLegalAcceptance(supabase, {
    authUserId,
    tenantId,
    version: legal.version,
    ip: acceptanceIp,
    userAgent: acceptanceUserAgent,
    source: "signup",
  });

  if (acceptanceError) return Response.json({ error: acceptanceError }, { status: 500 });

  // Estado de cobranca da conta nova. Nao achar plano de entrada — o que passa a
  // ser o caso normal quando o FREE sair do catalogo — deixa de ser silencio e
  // vira desfecho nomeado e registrado.
  await provisionEntrySubscription(supabase, tenantId, "signup");

  const { data: sessionData } = await supabase.auth.signInWithPassword({ email, password });
  const token = await signSession(authUserId);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);

  // Funil e e-mail de boas-vindas nao seguram a resposta: a conta ja existe e o
  // usuario ja tem sessao. `after()` roda depois da resposta mas ainda dentro da
  // invocacao — chamar sem await deixaria a promise ser descartada no fim da
  // requisicao, e ai nem o evento nem o registro em public.logs sairiam.
  after(async () => {
    await trackFunnelEvent({ tenantId, userId: authUserId, event: "signup", metadata: { source: "web" } });

    const { subject, html } = welcomeEmail(name, getAppUrl());
    await sendEmail({ to: email, subject, html, tenantId, kind: "welcome" });
  });

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

