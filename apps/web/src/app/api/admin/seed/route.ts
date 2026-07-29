import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext } from "@/lib/admin-guard";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// Dados fake realistas
const FAKE_TENANTS = [
  { name: "Loja da Maria", slug: "loja-da-maria" },
  { name: "Tech Solutions BR", slug: "tech-solutions-br" },
  { name: "Fitness Pro Academy", slug: "fitness-pro-academy" },
  { name: "Sabor & Arte Restaurante", slug: "sabor-arte-restaurante" },
  { name: "Digital Marketing Lab", slug: "digital-marketing-lab" },
  { name: "Pet Shop Amigão", slug: "pet-shop-amigao" },
  { name: "Consultoria Jurídica RJ", slug: "consultoria-juridica-rj" },
  { name: "Studio de Beleza Glow", slug: "studio-beleza-glow" },
];

const FAKE_USERS = [
  { name: "Maria Silva", email: "maria@lojadamaria.com" },
  { name: "João Pereira", email: "joao@techsolutions.com" },
  { name: "Ana Costa", email: "ana@fitnesspro.com" },
  { name: "Carlos Oliveira", email: "carlos@saborarte.com" },
  { name: "Fernanda Lima", email: "fernanda@digitallab.com" },
  { name: "Roberto Santos", email: "roberto@petamigao.com" },
  { name: "Juliana Rocha", email: "juliana@consultoriajur.com" },
  { name: "Patricia Mendes", email: "patricia@studioglow.com" },
  { name: "Lucas Almeida", email: "lucas@techsolutions.com" },
  { name: "Beatriz Ferreira", email: "beatriz@lojadamaria.com" },
  { name: "Thiago Nascimento", email: "thiago@fitnesspro.com" },
  { name: "Camila Ramos", email: "camila@digitallab.com" },
];

const FAKE_PHONES = [
  "+5511987654321", "+5521912345678", "+5531998765432",
  "+5541987651234", "+5551999887766", "+5561988776655",
  "+5571977665544", "+5581966554433",
];

const LOG_EVENTS = [
  { event: "whatsapp.qr_scanned", level: "info", message: "QR Code escaneado com sucesso" },
  { event: "campaign.sent", level: "info", message: "Campanha enviada para 245 contatos" },
  { event: "campaign.failed", level: "error", message: "Falha ao enviar: rate limit excedido" },
  { event: "instance.disconnected", level: "warn", message: "Instância desconectou inesperadamente" },
  { event: "user.login", level: "info", message: "Login realizado" },
  { event: "billing.payment_failed", level: "error", message: "Pagamento falhou: cartão recusado" },
  { event: "agent.execution", level: "info", message: "SDR Agent executou qualificação de 12 leads" },
  { event: "instance.connected", level: "info", message: "WhatsApp conectado" },
  { event: "stripe.webhook.received", level: "info", message: "Webhook Stripe recebido: invoice.paid" },
  { event: "user.signup", level: "info", message: "Novo usuário registrado" },
];

const ALERT_TYPES = [
  { type: "billing", severity: "warning", title: "Tenant inadimplente há 5 dias", message: "Loja da Maria não pagou a fatura de junho." },
  { type: "instance", severity: "critical", title: "Instância offline há 2h", message: "+5511987654321 desconectou e não reconectou." },
  { type: "error", severity: "critical", title: "Erro crítico no agent SDR", message: "Rate limit OpenAI atingido — agente pausado." },
  { type: "signup", severity: "info", title: "Novo tenant: Digital Marketing Lab", message: "Owner: fernanda@digitallab.com" },
  { type: "signup", severity: "info", title: "Novo tenant: Pet Shop Amigão", message: "Owner: roberto@petamigao.com" },
  { type: "billing", severity: "warning", title: "Trial expirando em 2 dias", message: "Fitness Pro Academy — trial acaba em 03/jul." },
  { type: "instance", severity: "warning", title: "Instância com latência alta", message: "+5521912345678 — tempo de resposta > 5s." },
  { type: "info", severity: "info", title: "Manutenção programada", message: "Supabase maintenance window em 05/jul 02:00-04:00." },
];

function randomDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  return d.toISOString();
}

export async function POST() {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const results: string[] = [];

  try {
    // 1. Criar planos se não existem
    const { data: existingPlans } = await supabase.from("plans").select("id, code");
    const planIds: Record<string, string> = {};

    if ((existingPlans ?? []).length === 0) {
      const plans = [
        { code: "free", name: "Free", price_cents: 0 },
        { code: "essencial", name: "Essencial", price_cents: 19700 },
        { code: "growth", name: "Growth", price_cents: 29700 },
        { code: "performance", name: "Operação", price_cents: 49700 },
      ];
      const { data: inserted } = await supabase.from("plans").insert(plans).select("id, code");
      for (const p of inserted ?? []) planIds[p.code] = p.id;
      results.push(`✅ ${plans.length} planos criados`);
    } else {
      for (const p of existingPlans ?? []) planIds[p.code] = p.id;
      results.push(`ℹ️ Planos já existem (${existingPlans?.length})`);
    }

    // 2. Criar tenants
    const tenantIds: string[] = [];
    for (const t of FAKE_TENANTS) {
      const { data: existing } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", t.slug)
        .maybeSingle();

      if (existing) {
        tenantIds.push(existing.id);
      } else {
        const id = randomUUID();
        await supabase.from("organizations").insert({
          id,
          name: t.name,
          slug: t.slug,
          status: Math.random() > 0.85 ? "suspended" : "active",
          created_at: randomDate(60),
        });
        tenantIds.push(id);
      }
    }
    results.push(`✅ ${FAKE_TENANTS.length} tenants (criados ou existentes)`);

    // 3. Criar users + memberships
    let usersCreated = 0;
    for (let i = 0; i < FAKE_USERS.length; i++) {
      const u = FAKE_USERS[i];
      const tenantId = tenantIds[i % tenantIds.length];
      const authId = randomUUID();

      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", u.email)
        .maybeSingle();

      if (!existingUser) {
        await supabase.from("users").insert({
          auth_user_id: authId,
          name: u.name,
          email: u.email,
          tenant_id: tenantId,
          created_at: randomDate(45),
        });

        await supabase.from("memberships").insert({
          tenant_id: tenantId,
          user_id: authId,
          role: i % 3 === 0 ? "owner" : i % 3 === 1 ? "admin" : "operator",
          accepted_at: randomDate(40),
        });
        usersCreated++;
      }
    }
    results.push(`✅ ${usersCreated} users + memberships criados`);

    // 4. Criar subscriptions
    const planCodes = ["free", "essencial", "growth", "performance"];
    for (let i = 0; i < tenantIds.length; i++) {
      const planCode = planCodes[i % planCodes.length];
      const planId = planIds[planCode];
      if (!planId) continue;

      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("tenant_id", tenantIds[i])
        .maybeSingle();

      if (!existingSub) {
        const statuses = ["active", "active", "trialing", "past_due", "free", "active", "canceled", "active"];
        await supabase.from("subscriptions").insert({
          tenant_id: tenantIds[i],
          plan_id: planId,
          status: statuses[i % statuses.length],
          created_at: randomDate(30),
        });
      }
    }
    results.push(`✅ Subscriptions criadas`);

    // 5. Criar instâncias WhatsApp
    let instancesCreated = 0;
    for (let i = 0; i < FAKE_PHONES.length; i++) {
      const tenantId = tenantIds[i % tenantIds.length];
      const { data: existing } = await supabase
        .from("instances")
        .select("id")
        .eq("phone", FAKE_PHONES[i])
        .maybeSingle();

      if (!existing) {
        await supabase.from("instances").insert({
          tenant_id: tenantId,
          phone: FAKE_PHONES[i],
          profile_name: FAKE_USERS[i]?.name ?? "Perfil " + i,
          status: Math.random() > 0.3 ? "connected" : "disconnected",
          last_seen_at: randomDate(2),
          created_at: randomDate(30),
        });
        instancesCreated++;
      }
    }
    results.push(`✅ ${instancesCreated} instâncias WhatsApp`);

    // 6. Criar logs
    const logsToInsert = [];
    for (let i = 0; i < 50; i++) {
      const logTemplate = LOG_EVENTS[i % LOG_EVENTS.length];
      logsToInsert.push({
        tenant_id: tenantIds[i % tenantIds.length],
        event: logTemplate.event,
        level: logTemplate.level,
        message: logTemplate.message,
        created_at: randomDate(14),
      });
    }
    await supabase.from("logs").insert(logsToInsert);
    results.push(`✅ 50 logs criados`);

    // 7. Criar alertas admin
    const alertsToInsert = ALERT_TYPES.map((a, i) => ({
      ...a,
      tenant_id: tenantIds[i % tenantIds.length],
      created_at: randomDate(7),
    }));
    await supabase.from("admin_alerts").insert(alertsToInsert);
    results.push(`✅ ${alertsToInsert.length} alertas admin criados`);

    // 8. Criar agent_configs
    const agents = ["sdr", "sales", "support", "content", "seo", "data-analyst"];
    const agentConfigs = [];
    for (let i = 0; i < tenantIds.length; i++) {
      for (let j = 0; j < 3; j++) {
        agentConfigs.push({
          tenant_id: tenantIds[i],
          agent_id: agents[(i + j) % agents.length],
          enabled: Math.random() > 0.3,
          total_executions: Math.floor(Math.random() * 500),
          last_execution_at: randomDate(3),
        });
      }
    }
    await supabase.from("agent_configs").upsert(agentConfigs, { onConflict: "tenant_id,agent_id" });
    results.push(`✅ ${agentConfigs.length} agent configs`);

    // 9. Funnel events
    const funnelEvents = ["signup", "qr_connected", "first_dispatch", "first_campaign_created", "payment_completed"];
    const funnelInserts = [];
    for (let i = 0; i < tenantIds.length; i++) {
      const eventsForTenant = funnelEvents.slice(0, Math.floor(Math.random() * 5) + 1);
      for (const event of eventsForTenant) {
        funnelInserts.push({
          tenant_id: tenantIds[i],
          user_id: randomUUID(),
          event_name: event,
          occurred_at: randomDate(20),
        });
      }
    }
    await supabase.from("funnel_events").upsert(funnelInserts, { onConflict: "tenant_id,event_name" });
    results.push(`✅ ${funnelInserts.length} funnel events`);

    return NextResponse.json({
      success: true,
      message: "Seed completo! Dados fake populados.",
      details: results,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unknown error",
      details: results,
    }, { status: 500 });
  }
}
