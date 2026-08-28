import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-guard";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { normalizePlanCode, SEED_PLAN_CATALOG } from "@/lib/billing/plan-codes";
import { blockInProduction, isDev } from "@/lib/environment";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/seed/dev
 *
 * Seed exclusivo para ambiente DEV.
 * Cria:
 * - Super admin (admin@localhost.dev)
 * - 3 tenants dev (tenant_dev, tenant_demo, tenant_stress)
 * - Usuários fake com memberships
 * - Subscriptions variadas
 * - Dados para testar multi-tenant
 *
 * ⚠️  BLOQUEADO em produção
 */
export async function POST() {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Guard: NUNCA executar em produção
  try {
    blockInProduction("dev-seed");
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 403 }
    );
  }

  if (!isDev()) {
    return NextResponse.json(
      { error: "Dev seed só pode ser executado em ambiente development" },
      { status: 403 }
    );
  }

  const supabase = getSupabaseAdmin();
  const results: string[] = [];

  try {
    // ====================================
    // 1. SUPER ADMIN DEV
    // ====================================
    const adminEmail = process.env.DEV_ADMIN_EMAIL || "admin@localhost.dev";
    const adminPassword = process.env.DEV_ADMIN_PASSWORD || "DevOnly123!";

    // Criar user no Supabase Auth
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const adminExists = existingUsers?.users?.find((u) => u.email === adminEmail);

    let adminAuthId: string;
    if (adminExists) {
      adminAuthId = adminExists.id;
      results.push(`ℹ️ Super admin já existe: ${adminEmail}`);
    } else {
      const { data: newAdmin, error: adminError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          name: "Super Admin DEV",
          role: "platform_admin",
          is_dev: true,
        },
      });

      if (adminError) throw new Error(`Erro criando admin: ${adminError.message}`);
      adminAuthId = newAdmin.user.id;
      results.push(`✅ Super admin criado: ${adminEmail} / ${adminPassword}`);
    }

    // ====================================
    // 2. TENANTS DEV
    // ====================================
    const DEV_TENANTS = [
      {
        name: "[DEV] Workspace Principal",
        slug: "tenant-dev",
        status: "active",
        description: "Tenant principal para desenvolvimento e testes",
      },
      {
        name: "[DEMO] Empresa Demonstração",
        slug: "tenant-demo",
        status: "active",
        description: "Tenant para demos e apresentações",
      },
      {
        name: "[STRESS] Teste de Carga",
        slug: "tenant-stress",
        status: "active",
        description: "Tenant para testes de stress e performance",
      },
    ];

    const tenantIds: Record<string, string> = {};

    for (const t of DEV_TENANTS) {
      const { data: existing } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", t.slug)
        .maybeSingle();

      if (existing) {
        tenantIds[t.slug] = existing.id;
        results.push(`ℹ️ Tenant já existe: ${t.name}`);
      } else {
        const id = randomUUID();
        const { error } = await supabase.from("organizations").insert({
          id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          created_at: new Date().toISOString(),
        });
        if (error) throw new Error(`Erro criando tenant ${t.slug}: ${error.message}`);
        tenantIds[t.slug] = id;
        results.push(`✅ Tenant criado: ${t.name}`);
      }
    }

    // ====================================
    // 3. MEMBERSHIPS DO ADMIN
    // ====================================
    for (const [slug, tenantId] of Object.entries(tenantIds)) {
      const { data: existingMembership } = await supabase
        .from("memberships")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", adminAuthId)
        .maybeSingle();

      if (!existingMembership) {
        await supabase.from("memberships").insert({
          tenant_id: tenantId,
          user_id: adminAuthId,
          role: "owner",
          accepted_at: new Date().toISOString(),
        });
        results.push(`✅ Admin vinculado ao ${slug} como owner`);
      }
    }

    // ====================================
    // 4. PLANOS
    // ====================================
    const { data: existingPlans } = await supabase.from("plans").select("id, code");
    const planIds: Record<string, string> = {};

    if ((existingPlans ?? []).length === 0) {
      // `SEED_PLAN_CATALOG`, e nao uma lista propria. A que vivia aqui tinha
      // dois defeitos que so apareciam em banco vazio: gravava `free` (o
      // gratuito que o paid-first matou) e, pior, gravava os planos SEM
      // `limits` — e `plans.limits` e NOT NULL DEFAULT '{}', que
      // `tenantLimitsFrom` respeita como "sem teto" quando existe assinatura.
      // Ou seja: todo tenant semeado saia ILIMITADO, que e exatamente o defeito
      // que o #162 fechou, voltando pela porta do seed.
      const plans = SEED_PLAN_CATALOG.map((plan) => ({ ...plan }));
      const { data: inserted } = await supabase.from("plans").insert(plans).select("id, code");
      for (const p of inserted ?? []) planIds[normalizePlanCode(p.code)] = p.id;
      results.push(`✅ ${plans.length} planos criados`);
    } else {
      for (const p of existingPlans ?? []) planIds[normalizePlanCode(p.code)] = p.id;
      results.push(`ℹ️ Planos já existem`);
    }

    // ====================================
    // 5. SUBSCRIPTIONS POR TENANT
    // ====================================
    // Codigos canonicos: a busca abaixo normaliza os dois lados, entao um banco
    // com `growth` minusculo e outro com `GROWTH` casam do mesmo jeito. Era essa
    // divergencia que fazia `planIds[...]` dar `undefined` e o seed pular a
    // criacao de assinatura em silencio.
    const tenantPlans: Record<string, string> = {
      "tenant-dev": "PERFORMANCE_MAX",
      "tenant-demo": "GROWTH",
      "tenant-stress": "ESSENCIAL",
    };

    for (const [slug, planCode] of Object.entries(tenantPlans)) {
      const tenantId = tenantIds[slug];
      const planId = planIds[normalizePlanCode(planCode)];
      if (!tenantId || !planId) continue;

      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!existing) {
        await supabase.from("subscriptions").insert({
          tenant_id: tenantId,
          plan_id: planId,
          status: "active",
          created_at: new Date().toISOString(),
        });
        results.push(`✅ Subscription ${planCode} → ${slug}`);
      }
    }

    // ====================================
    // 6. USUÁRIOS FAKE PARA MULTI-TENANT
    // ====================================
    const DEV_USERS = [
      { name: "Operador Dev", email: "operador@dev.local", tenant: "tenant-dev", role: "operator" },
      { name: "Admin Demo", email: "admin@demo.local", tenant: "tenant-demo", role: "admin" },
      { name: "User Stress 1", email: "stress1@test.local", tenant: "tenant-stress", role: "operator" },
      { name: "User Stress 2", email: "stress2@test.local", tenant: "tenant-stress", role: "operator" },
      { name: "User Stress 3", email: "stress3@test.local", tenant: "tenant-stress", role: "admin" },
    ];

    let usersCreated = 0;
    for (const u of DEV_USERS) {
      const tenantId = tenantIds[u.tenant];
      if (!tenantId) continue;

      // Criar no Auth
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: "DevUser123!",
        email_confirm: true,
        user_metadata: { name: u.name, is_dev: true },
      });

      if (authErr) {
        // Já existe — buscar
        const { data: users } = await supabase.auth.admin.listUsers();
        const existing = users?.users?.find((x) => x.email === u.email);
        if (existing) {
          // Garantir membership
          const { data: mem } = await supabase
            .from("memberships")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("user_id", existing.id)
            .maybeSingle();
          if (!mem) {
            await supabase.from("memberships").insert({
              tenant_id: tenantId,
              user_id: existing.id,
              role: u.role,
              accepted_at: new Date().toISOString(),
            });
          }
        }
        continue;
      }

      if (authUser?.user) {
        await supabase.from("memberships").insert({
          tenant_id: tenantId,
          user_id: authUser.user.id,
          role: u.role,
          accepted_at: new Date().toISOString(),
        });
        usersCreated++;
      }
    }
    results.push(`✅ ${usersCreated} usuários DEV criados`);

    // ====================================
    // 7. INSTÂNCIAS WHATSAPP FAKE
    // ====================================
    const devPhones = [
      { phone: "+5511000000001", tenant: "tenant-dev", name: "DEV WhatsApp 1" },
      { phone: "+5511000000002", tenant: "tenant-demo", name: "DEMO WhatsApp" },
      { phone: "+5511000000003", tenant: "tenant-stress", name: "STRESS WA 1" },
      { phone: "+5511000000004", tenant: "tenant-stress", name: "STRESS WA 2" },
    ];

    for (const inst of devPhones) {
      const tenantId = tenantIds[inst.tenant];
      if (!tenantId) continue;

      const { data: existing } = await supabase
        .from("instances")
        .select("id")
        .eq("phone", inst.phone)
        .maybeSingle();

      if (!existing) {
        await supabase.from("instances").insert({
          tenant_id: tenantId,
          phone: inst.phone,
          profile_name: inst.name,
          status: "connected",
          last_seen_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
      }
    }
    results.push(`✅ Instâncias WhatsApp fake criadas`);

    // ====================================
    // 8. LOGS DE EXEMPLO
    // ====================================
    const devLogs = [
      { event: "dev.seed_executed", level: "info", message: "Dev seed executado com sucesso" },
      { event: "dev.mock_engine_started", level: "info", message: "Engine mock iniciada" },
      { event: "user.login", level: "info", message: `Admin ${adminEmail} logou` },
    ];

    for (const log of devLogs) {
      await supabase.from("logs").insert({
        tenant_id: tenantIds["tenant-dev"],
        ...log,
        created_at: new Date().toISOString(),
      });
    }
    results.push(`✅ Logs de dev criados`);

    // ====================================
    // RESULTADO
    // ====================================
    return NextResponse.json({
      success: true,
      environment: "development",
      message: "🧪 Dev seed completo! Ambiente local pronto.",
      admin: {
        email: adminEmail,
        password: adminPassword,
        tenants: Object.keys(tenantIds),
      },
      tenants: tenantIds,
      details: results,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        details: results,
      },
      { status: 500 }
    );
  }
}
