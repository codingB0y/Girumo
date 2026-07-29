import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import {
  nudgeConnectEmail,
  disconnectAlertEmail,
  activationD3Email,
  activationD7Email,
  activationD14Email,
  activationD21Email,
} from "@/lib/email/templates";
import { activationMarkerForAge, activationNotificationType, type ActivationMarker } from "@/lib/email/activation-cadence";
import { isCronAuthorized } from "@/lib/cron-auth";
import { selectSessionRow, isConnectedStatus } from "@/lib/session-select";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * GET /api/cron/emails
 * Chamado por Vercel Cron (vercel.json) com Authorization Bearer.
 *
 * Jobs:
 * 1. Nudge: 24h sem conectar WhatsApp → envia email
 * 2. Disconnect: WhatsApp desconectado há mais de 2h → envia email
 * 3. Cadência de ativação: por idade da conta (D3/D7/D14/D21) → envia email
 *
 * O e-mail de trial foi aposentado (a oferta atual não tem trial) — a cadência de
 * ativação tomou o lugar. `trialEndingEmail` segue versionado, mas não é disparado.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Escolhe o template do marco. D3 precisa do total de cliques do tenant.
async function buildActivationEmail(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  marker: ActivationMarker,
  name: string,
  appUrl: string,
): Promise<{ subject: string; html: string }> {
  if (marker === 3) {
    const { data: links } = await supabase.from("tracked_links").select("clicks").eq("tenant_id", tenantId);
    const clicks = (links ?? []).reduce((sum, l) => sum + Number(l.clicks ?? 0), 0);
    return activationD3Email(name, appUrl, clicks);
  }
  if (marker === 7) return activationD7Email(name, appUrl);
  if (marker === 14) return activationD14Email(name, appUrl);
  return activationD21Email(name, appUrl);
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.hubflow.com.br";
  const results = { nudge_sent: 0, disconnect_sent: 0, activation_sent: 0, errors: 0 };

  // --- Job 1: 24h sem conectar ---
  // Tenants criados há 24-48h sem nenhum heartbeat de session
  const now = new Date();
  const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const h48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const { data: recentOrgs } = await supabase
    .from("organizations")
    .select("id, name, created_at")
    .gte("created_at", h48Ago)
    .lte("created_at", h24Ago);

  for (const org of recentOrgs ?? []) {
    // Checa se já teve algum heartbeat (session com live=true)
    const { data: funnelEvent } = await supabase
      .from("funnel_events")
      .select("id")
      .eq("tenant_id", org.id)
      .eq("event_name", "qr_connected")
      .maybeSingle();

    if (funnelEvent) continue; // Já conectou, skip

    // Checa se já mandou esse email
    const { data: alreadySent } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", org.id)
      .eq("type", "nudge_connect")
      .maybeSingle();

    if (alreadySent) continue;

    // Busca owner email
    const { data: owner } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", org.id)
      .eq("role", "owner")
      .maybeSingle();

    if (!owner) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id);
    const email = userData.user?.email;
    const name = userData.user?.user_metadata?.name || "lojista";

    if (!email) continue;

    const tpl = nudgeConnectEmail(name, appUrl);
    const sent = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });

    if (sent) {
      results.nudge_sent++;
      // Registra como notification pra não mandar de novo
      await supabase.from("notifications").insert({
        tenant_id: org.id,
        user_id: owner.user_id,
        type: "nudge_connect",
        title: "Lembrete: conectar WhatsApp",
        body: "Enviamos um email lembrando de conectar.",
      });
    } else {
      results.errors++;
    }
  }

  // --- Job 2: Cadência de ativação dos 30 dias (D3/D7/D14/D21) ---
  // Substitui o antigo e-mail de trial. Por idade da conta, manda o e-mail do
  // marco vigente — 1× por marco (dedupe em notifications). Só olha contas entre
  // 3 e 28 dias; fora dessa janela a cadência não se aplica.
  const cadenceOldest = new Date(now.getTime() - 28 * DAY_MS).toISOString();
  const cadenceNewest = new Date(now.getTime() - 3 * DAY_MS).toISOString();

  const { data: cadenceOrgs } = await supabase
    .from("organizations")
    .select("id, created_at")
    .gte("created_at", cadenceOldest)
    .lte("created_at", cadenceNewest);

  for (const org of cadenceOrgs ?? []) {
    const ageDays = Math.floor((now.getTime() - new Date(org.created_at).getTime()) / DAY_MS);
    const marker = activationMarkerForAge(ageDays);
    if (!marker) continue;

    const notifType = activationNotificationType(marker);
    const { data: alreadySent } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", org.id)
      .eq("type", notifType)
      .maybeSingle();

    if (alreadySent) continue;

    const { data: owner } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", org.id)
      .eq("role", "owner")
      .maybeSingle();

    if (!owner) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id);
    const email = userData.user?.email;
    const name = userData.user?.user_metadata?.name || "lojista";

    if (!email) continue;

    const tpl = await buildActivationEmail(supabase, org.id, marker, name, appUrl);
    const sent = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });

    if (sent) {
      results.activation_sent++;
      await supabase.from("notifications").insert({
        tenant_id: org.id,
        user_id: owner.user_id,
        type: notifType,
        title: `Dica de ativação (D${marker})`,
        body: "Enviamos uma dica por e-mail pra você aproveitar melhor a Girumo.",
      });
    } else {
      results.errors++;
    }
  }

  // --- Job 3: WhatsApp desconectado há mais de 2h ---
  const twoHoursAgoMs = now.getTime() - 2 * 60 * 60 * 1000;
  const todayStartISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const { data: allOrgs } = await supabase.from("organizations").select("id, name");

  for (const org of allOrgs ?? []) {
    const { data: instanceRows } = await supabase
      .from("instances")
      .select("status, updated_at, disconnected_at")
      .eq("tenant_id", org.id)
      .order("updated_at", { ascending: false })
      .limit(20);

    const row = selectSessionRow(instanceRows ?? []);
    // Sem linha nenhuma = nunca conectou (onboarding, não desconexão) — pula.
    if (!row || isConnectedStatus(row.status)) continue;

    const disconnectedAtMs = row.disconnected_at ? new Date(row.disconnected_at).getTime() : NaN;
    if (!Number.isFinite(disconnectedAtMs) || disconnectedAtMs > twoHoursAgoMs) continue;

    // Dedup: no máximo 1 alerta de desconexão por tenant por dia.
    const { data: sentToday } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", org.id)
      .eq("type", "disconnect_alert")
      .gte("created_at", todayStartISO)
      .maybeSingle();
    if (sentToday) continue;

    const { data: owner } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", org.id)
      .eq("role", "owner")
      .maybeSingle();
    if (!owner) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id);
    const email = userData.user?.email;
    const name = userData.user?.user_metadata?.name || "lojista";
    if (!email) continue;

    const tpl = disconnectAlertEmail(name, appUrl);
    const sent = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });

    if (sent) {
      results.disconnect_sent++;
      await supabase.from("notifications").insert({
        tenant_id: org.id,
        user_id: owner.user_id,
        type: "disconnect_alert",
        title: "WhatsApp desconectado",
        body: "Enviamos um e-mail avisando que o WhatsApp está desconectado há mais de 2h.",
      });
    } else {
      results.errors++;
    }
  }

  return Response.json({
    ok: true,
    ...results,
    timestamp: now.toISOString(),
  });
}
