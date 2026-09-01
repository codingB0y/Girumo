import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-guard";
import { buildManualGrant, buildManualRevoke } from "@/lib/billing/manual-grant";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/**
 * Concessão manual de plano pelo admin da plataforma (cortesia, teste, suporte).
 *
 * Separada de `[id]/actions` de propósito: aquela mexe no ciclo de vida do
 * tenant (suspender, excluir) e esta mexe em COBRANÇA. Juntar as duas colocaria
 * "conceder plano pago de graça" no mesmo switch de "excluir tenant".
 *
 * A decisão do que gravar mora em `lib/billing/manual-grant.ts`, que roda sob
 * `tsx --test`. Aqui fica só a fronteira: quem pode, o que existe, o que grava.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const { action, planId, reason } = (body ?? {}) as {
    action?: string;
    planId?: string;
    reason?: string;
  };

  if (action !== "grant" && action !== "revoke") {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  // Falha de leitura não é "tenant não existe": afirmar 404 aqui esconderia um
  // banco fora do ar atrás de uma mensagem que manda o admin procurar o tenant.
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });
  if (!org) return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });

  // `subscriptions` tem unique(tenant_id): no máximo uma linha por tenant.
  const { data: atual, error: subError } = await supabase
    .from("subscriptions")
    .select("id, metadata")
    .eq("tenant_id", id)
    .maybeSingle();

  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 });

  const now = new Date();

  if (action === "revoke") {
    if (!atual) {
      return NextResponse.json({ error: "Este tenant não tem assinatura." }, { status: 404 });
    }

    const { error } = await supabase
      .from("subscriptions")
      .update(buildManualRevoke({ adminEmail: admin.email, currentMetadata: atual.metadata, now }))
      .eq("id", atual.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: `Acesso de "${org.name}" revogado.` });
  }

  if (!planId || typeof planId !== "string") {
    return NextResponse.json({ error: "Escolha um plano." }, { status: 400 });
  }

  // O plano vem do cliente: sem esta checagem, um `plan_id` qualquer viraria
  // erro de foreign key (500 opaco) em vez de uma mensagem que se entende.
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, name")
    .eq("id", planId)
    .maybeSingle();

  if (planError) return NextResponse.json({ error: planError.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });

  const row = buildManualGrant({
    tenantId: id,
    planId: plan.id,
    adminEmail: admin.email,
    reason,
    currentMetadata: atual?.metadata,
    now,
  });

  // Upsert por `tenant_id`: o supabase-js gera `ON CONFLICT DO UPDATE SET` só
  // das colunas do payload, então `stripe_customer_id` e
  // `stripe_subscription_id` de uma assinatura real sobrevivem — apagá-los
  // faria o próximo webhook do Stripe não achar a linha e tentar criar uma
  // segunda contra o unique(tenant_id).
  const { error } = await supabase.from("subscriptions").upsert(row, { onConflict: "tenant_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    message: `"${org.name}" agora está no plano ${plan.name} (concessão manual, sem cobrança).`,
  });
}
