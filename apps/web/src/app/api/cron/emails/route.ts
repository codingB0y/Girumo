import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { nudgeConnectEmail, trialEndingEmail } from "@/lib/email/templates";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * GET /api/cron/emails
 * Chamado por Vercel Cron (vercel.json) com Authorization Bearer.
 *
 * Jobs:
 * 1. Nudge: 24h sem conectar WhatsApp → envia email
 * 2. Trial ending: trial termina em 2 dias → envia email
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.hubflow.com.br";
  const results = { nudge_sent: 0, trial_sent: 0, errors: 0 };

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

  // --- Job 2: Trial acabando (2 dias) ---
  const { data: trialing } = await supabase
    .from("subscriptions")
    .select("tenant_id, created_at")
    .eq("status", "free")
    .not("created_at", "is", null);

  for (const sub of trialing ?? []) {
    const createdAt = new Date(sub.created_at);
    const trialEnd = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    if (daysLeft !== 2) continue; // Só manda quando faltam exatamente 2 dias

    // Checa se já mandou
    const { data: alreadySent } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", sub.tenant_id)
      .eq("type", "trial_ending")
      .maybeSingle();

    if (alreadySent) continue;

    // Busca owner
    const { data: owner } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", sub.tenant_id)
      .eq("role", "owner")
      .maybeSingle();

    if (!owner) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id);
    const email = userData.user?.email;
    const name = userData.user?.user_metadata?.name || "lojista";

    if (!email) continue;

    const tpl = trialEndingEmail(name, appUrl, daysLeft);
    const sent = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });

    if (sent) {
      results.trial_sent++;
      await supabase.from("notifications").insert({
        tenant_id: sub.tenant_id,
        user_id: owner.user_id,
        type: "trial_ending",
        title: "Trial acabando",
        body: "Enviamos um email avisando que o trial termina em 2 dias.",
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
