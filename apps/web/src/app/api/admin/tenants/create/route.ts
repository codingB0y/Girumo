import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";
import { provisionEntrySubscription } from "@/lib/billing/entry-subscription";

export const dynamic = "force-dynamic";

/**
 * POST — criar novo tenant manualmente pelo admin
 * Body: { name, slug, ownerEmail, planId? }
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, slug, ownerEmail, planId } = body as {
    name: string;
    slug: string;
    ownerEmail: string;
    planId?: string;
  };

  if (!name || !slug || !ownerEmail) {
    return NextResponse.json(
      { error: "name, slug, and ownerEmail are required" },
      { status: 400 },
    );
  }

  // Validar slug (kebab-case)
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "slug must be lowercase alphanumeric with dashes" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // Verificar slug único
  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
  }

  // Verificar se owner existe no auth
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const ownerAuth = authUsers?.users?.find(
    (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase(),
  );

  let ownerAuthId: string;

  if (ownerAuth) {
    ownerAuthId = ownerAuth.id;
  } else {
    // Criar user no Supabase Auth (invite)
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: ownerEmail,
      email_confirm: false, // Vai receber email de confirmação
    });

    if (createErr || !newUser.user) {
      return NextResponse.json(
        { error: `Failed to create user: ${createErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    ownerAuthId = newUser.user.id;
  }

  // Criar organização
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({
      name,
      slug,
      status: "active",
      created_by: ownerAuthId,
    })
    .select("id")
    .single();

  if (orgErr || !org) {
    return NextResponse.json(
      { error: `Failed to create org: ${orgErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // Garantir que o user existe na tabela users
  await supabase.from("users").upsert(
    {
      auth_user_id: ownerAuthId,
      email: ownerEmail.toLowerCase(),
      name: ownerEmail.split("@")[0],
      tenant_id: org.id,
    },
    { onConflict: "auth_user_id" },
  );

  // Criar membership (owner)
  await supabase.from("memberships").insert({
    tenant_id: org.id,
    user_id: ownerAuthId,
    role: "owner",
    accepted_at: new Date().toISOString(),
  });

  // Estado de cobranca da conta nova. A busca do plano, a divergencia de caixa
  // (`free` x `FREE`) e o desfecho de "nao achei" vivem em
  // `provisionEntrySubscription` — antes cada porta resolvia isso do seu jeito,
  // e o "nao achei" era um `if` que simplesmente nao acontecia.
  const billing = await provisionEntrySubscription(supabase, String(org.id), "admin", {
    chosenPlanId: planId ?? null,
  });

  // Criar alerta de novo signup
  await supabase.from("admin_alerts").insert({
    type: "signup",
    severity: "info",
    title: `Novo tenant criado: ${name}`,
    message: `Owner: ${ownerEmail}. Criado manualmente pelo admin.`,
    tenant_id: org.id,
  });

  // O desfecho da cobranca vai na resposta, e nao so no log. O admin acabou de
  // escolher um plano na tela; descobrir semanas depois que o tenant nasceu sem
  // assinatura — porque um insert falhou em silencio — e a forma exata do bug
  // que este PR fecha.
  return NextResponse.json({
    success: true,
    tenantId: org.id,
    billing,
    message:
      billing.kind === "subscribed"
        ? `Tenant "${name}" criado com sucesso.`
        : `Tenant "${name}" criado, mas SEM assinatura (${billing.reason}): ele nasce bloqueado no paywall.`,
  });
}
