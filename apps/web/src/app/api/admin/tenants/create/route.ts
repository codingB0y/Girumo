import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";
import { FREE_PLAN_CODE } from "@/lib/billing/plan-codes";

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

  // Criar subscription (free ou plano específico)
  const subPlanId = planId ?? null;
  if (subPlanId) {
    await supabase.from("subscriptions").insert({
      tenant_id: org.id,
      plan_id: subPlanId,
      status: "active",
    });
  } else {
    // Buscar plano free.
    //
    // `ilike` e o codigo canonico: isto procurava `.eq("code","free")`
    // minusculo, e como producao tem `FREE` o `if (freePlan)` abaixo sempre dava
    // falso — a rota criava o tenant SEM assinatura, em silencio. Era a origem
    // das organizacoes sem subscription, e virou visivel depois do PR #148,
    // quando tenant sem assinatura passou a receber o teto do FREE.
    const { data: freePlan } = await supabase
      .from("plans")
      .select("id")
      .ilike("code", FREE_PLAN_CODE)
      .maybeSingle();

    if (freePlan) {
      await supabase.from("subscriptions").insert({
        tenant_id: org.id,
        plan_id: freePlan.id,
        status: "free",
      });
    }
  }

  // Criar alerta de novo signup
  await supabase.from("admin_alerts").insert({
    type: "signup",
    severity: "info",
    title: `Novo tenant criado: ${name}`,
    message: `Owner: ${ownerEmail}. Criado manualmente pelo admin.`,
    tenant_id: org.id,
  });

  return NextResponse.json({
    success: true,
    tenantId: org.id,
    message: `Tenant "${name}" criado com sucesso.`,
  });
}
