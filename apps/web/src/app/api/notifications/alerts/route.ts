import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/alerts
 *
 * Verifica condições operacionais e cria notificações automáticas.
 * Pode ser chamado por cron (Vercel Cron) ou engine.
 *
 * Alertas:
 * 1. Grupo ≥ 90% capacidade → "Grupo quase cheio"
 * 2. Campanha sem cliques em 3 dias → "Campanha parada"
 * 3. Campanha sem link de convite em grupos → "Configure convites"
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  // Get all tenants with active memberships
  const { data: tenants } = await supabase
    .from("memberships")
    .select("tenant_id")
    .not("accepted_at", "is", null)
    .order("created_at");

  const tenantIds = [...new Set((tenants ?? []).map((t) => t.tenant_id))];
  let totalAlerts = 0;

  for (const tenantId of tenantIds) {
    const alerts = await checkTenantAlerts(supabase, tenantId);
    totalAlerts += alerts;
  }

  return NextResponse.json({ ok: true, alerts: totalAlerts, tenants: tenantIds.length });
}

async function checkTenantAlerts(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
): Promise<number> {
  let count = 0;

  // --- Alert 1: Groups almost full (≥ 90%) ---
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, members, capacity")
    .eq("tenant_id", tenantId)
    .gt("capacity", 0);

  const almostFull = (groups ?? []).filter(
    (g) => g.capacity > 0 && g.members / g.capacity >= 0.9,
  );

  if (almostFull.length > 0) {
    // Check if we already sent this alert recently (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("type", "warning")
      .like("title", "%quase cheio%")
      .gte("created_at", oneDayAgo)
      .limit(1);

    if (!existing || existing.length === 0) {
      const names = almostFull.slice(0, 3).map((g) => g.name).join(", ");
      const suffix = almostFull.length > 3 ? ` e +${almostFull.length - 3}` : "";

      const { error: insertError } = await supabase.from("notifications").insert({
        tenant_id: tenantId,
        type: "warning",
        title: `${almostFull.length} grupo${almostFull.length > 1 ? "s" : ""} quase cheio${almostFull.length > 1 ? "s" : ""}`,
        body: `${names}${suffix} — crie novos grupos antes de perder captação.`,
        href: "/painel/grupos",
      });
      if (insertError) {
        console.error("[api/notifications/alerts] falha gravando alerta de grupo quase cheio:", insertError.message);
      }
      count++;
    }
  }

  // --- Alert 2: Campaign groups with no new members in 3 days ---
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: campaigns } = await supabase
    .from("campaign_groups")
    .select("id, name, updated_at")
    .eq("tenant_id", tenantId);

  const staleCampaigns = (campaigns ?? []).filter(
    (c) => c.updated_at && c.updated_at < threeDaysAgo,
  );

  if (staleCampaigns.length > 0) {
    // Dedupe: don't alert same thing within 3 days
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("type", "info")
      .like("title", "%parada%")
      .gte("created_at", threeDaysAgo)
      .limit(1);

    if (!existing || existing.length === 0) {
      const name = staleCampaigns[0].name;
      const extra = staleCampaigns.length > 1 ? ` e +${staleCampaigns.length - 1}` : "";

      const { error: insertError } = await supabase.from("notifications").insert({
        tenant_id: tenantId,
        type: "info",
        title: `Campanha "${name}"${extra} parada há 3+ dias`,
        body: "Nenhuma atividade nova. Compartilhe o link novamente ou crie um disparo.",
        href: "/painel/campanhas",
      });
      if (insertError) {
        console.error("[api/notifications/alerts] falha gravando alerta de campanha parada:", insertError.message);
      }
      count++;
    }
  }

  // --- Alert 3: Groups missing invite URL ---
  const missingInvite = (groups ?? []).filter(
    (g) => !(g as unknown as Record<string, unknown>).invite_url,
  );

  // Only alert if tenant has campaigns (i.e., is actively using the product)
  if (missingInvite.length > 0 && (campaigns ?? []).length > 0) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("type", "warning")
      .like("title", "%sem convite%")
      .gte("created_at", threeDaysAgo)
      .limit(1);

    if (!existing || existing.length === 0) {
      const { error: insertError } = await supabase.from("notifications").insert({
        tenant_id: tenantId,
        type: "warning",
        title: `${missingInvite.length} grupo${missingInvite.length > 1 ? "s" : ""} sem convite configurado`,
        body: "Sem link de convite, novos membros não conseguem entrar automaticamente.",
        href: "/painel/grupos",
      });
      if (insertError) {
        console.error("[api/notifications/alerts] falha gravando alerta de grupo sem convite:", insertError.message);
      }
      count++;
    }
  }

  return count;
}
