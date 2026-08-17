import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import {
  nudgeConnectEmail,
  disconnectAlertEmail,
  weeklyReportEmail,
  activationD3Email,
  activationD7Email,
  activationD14Email,
  activationD21Email,
  type WeeklyReportStats,
} from "@/lib/email/templates";
import { activationMarkerForAge, activationNotificationType, type ActivationMarker } from "@/lib/email/activation-cadence";
import { canSendAlert } from "@/lib/email/alert-optout";
import { isCronAuthorized } from "@/lib/cron-auth";
import { selectSessionRow, isConnectedStatus } from "@/lib/session-select";
import { getAppUrl } from "@/lib/environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";
const SP_TZ = "America/Sao_Paulo";

/**
 * GET /api/cron/emails
 * Chamado por Vercel Cron (vercel.json) com Authorization Bearer.
 *
 * Jobs:
 * 1. Nudge: 24h sem conectar WhatsApp → envia email
 * 2. Cadência de ativação: por idade da conta (D3/D7/D14/D21) → envia email
 * 3. Disconnect alert: WhatsApp desconectado há mais de 2h → envia email
 * 4. Relatório semanal: só às segundas (America/Sao_Paulo) → envia resumo da semana anterior
 *
 * O e-mail de trial foi aposentado (a oferta atual não tem trial) — a cadência de
 * ativação tomou o lugar. `trialEndingEmail` segue versionado, mas não é disparado.
 */

// Escolhe o template do marco de cadência. D3 precisa do total de cliques do tenant.
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

// O cron da Vercel roda em UTC (vercel.json agenda 12:00 UTC = 09:00 em São
// Paulo, que não tem horário de verão desde 2019 — offset fixo -03:00).
// new Date().getDay() daria o dia da semana em UTC, que pode divergir do dia
// local; por isso lemos o dia via Intl com timeZone explícito.
function saoPauloDateParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayIndex[get("weekday")] ?? -1,
  };
}

function saoPauloMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
}

function isMondayInSaoPaulo(date: Date): boolean {
  return saoPauloDateParts(date).weekday === 1;
}

type WeekWindows = {
  currentWeekStartIso: string;
  currentWeekEndIso: string;
  previousWeekStartIso: string;
  weekLabel: string;
};

// Semana de referência = a que acabou de fechar (segunda a domingo anteriores
// a hoje). currentWeekEndIso é hoje 00:00 em SP: fim exclusivo da janela E,
// coincidentemente, o corte usado pro dedupe (nada enviado hoje ainda).
function weekWindowsInSaoPaulo(now: Date): WeekWindows {
  const { year, month, day } = saoPauloDateParts(now);
  const todayStart = saoPauloMidnightUtc(year, month, day);
  const currentWeekEnd = todayStart;
  const currentWeekStart = new Date(currentWeekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const previousWeekStart = new Date(currentWeekEnd.getTime() - 14 * 24 * 60 * 60 * 1000);
  const lastDayOfWeek = new Date(currentWeekEnd.getTime() - 24 * 60 * 60 * 1000);

  const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: SP_TZ, day: "2-digit" });
  const dayMonthFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: SP_TZ, day: "2-digit", month: "long" });
  const weekLabel = `${dayFmt.format(currentWeekStart)} a ${dayMonthFmt.format(lastDayOfWeek)}`;

  return {
    currentWeekStartIso: currentWeekStart.toISOString(),
    currentWeekEndIso: currentWeekEnd.toISOString(),
    previousWeekStartIso: previousWeekStart.toISOString(),
    weekLabel,
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

async function buildWeeklyStats(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  windows: WeekWindows,
): Promise<WeeklyReportStats> {
  const { currentWeekStartIso, currentWeekEndIso, previousWeekStartIso, weekLabel } = windows;

  const [currentLeads, previousLeadsCount, currentOrders, previousOrders, links] = await Promise.all([
    supabase
      .from("leads")
      .select("source_group_name")
      .eq("tenant_id", tenantId)
      .gte("entered_at", currentWeekStartIso)
      .lt("entered_at", currentWeekEndIso),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("entered_at", previousWeekStartIso)
      .lt("entered_at", currentWeekStartIso),
    supabase
      .from("orders")
      .select("value")
      .eq("tenant_id", tenantId)
      .gte("created_at", currentWeekStartIso)
      .lt("created_at", currentWeekEndIso),
    supabase
      .from("orders")
      .select("value")
      .eq("tenant_id", tenantId)
      .gte("created_at", previousWeekStartIso)
      .lt("created_at", currentWeekStartIso),
    supabase.from("tracked_links").select("clicks").eq("tenant_id", tenantId),
  ]);

  const currentLeadRows = currentLeads.data ?? [];
  const currentOrderRows = currentOrders.data ?? [];
  const previousOrderRows = previousOrders.data ?? [];

  const revenue = currentOrderRows.reduce((sum, o) => sum + Number(o.value ?? 0), 0);
  const previousRevenue = previousOrderRows.reduce((sum, o) => sum + Number(o.value ?? 0), 0);
  const clicksTotal = (links.data ?? []).reduce((sum, l) => sum + Number(l.clicks ?? 0), 0);

  const groupCounts = new Map<string, number>();
  for (const lead of currentLeadRows) {
    const name = lead.source_group_name;
    if (!name) continue;
    groupCounts.set(name, (groupCounts.get(name) ?? 0) + 1);
  }
  let topGroup: { name: string; count: number } | null = null;
  for (const [name, count] of groupCounts) {
    if (!topGroup || count > topGroup.count) topGroup = { name, count };
  }

  return {
    weekLabel,
    newContacts: currentLeadRows.length,
    newContactsChangePct: pctChange(currentLeadRows.length, previousLeadsCount.count ?? 0),
    ordersCount: currentOrderRows.length,
    ordersChangePct: pctChange(currentOrderRows.length, previousOrderRows.length),
    revenue,
    revenueChangePct: pctChange(revenue, previousRevenue),
    clicksTotal,
    topGroup,
  };
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const appUrl = getAppUrl();
  const results = { nudge_sent: 0, disconnect_sent: 0, activation_sent: 0, weekly_sent: 0, errors: 0 };

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
  // marco vigente — 1× por marco (dedupe em notifications). Só contas de 3-28 dias.
  const DAY_MS = 24 * 60 * 60 * 1000;
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

  const { data: disconnectOrgs } = await supabase.from("organizations").select("id, name");

  for (const org of disconnectOrgs ?? []) {
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

    // Opt-out do lojista. Lido antes do dedupe e da busca do dono: quem desligou
    // não precisa custar mais três queries por dia.
    const { data: prefs, error: prefsError } = await supabase
      .from("tenant_settings")
      .select("disconnect_alert_enabled")
      .eq("tenant_id", org.id)
      .maybeSingle();

    // O erro é contado e logado aqui, mas quem decide enviar ou não é sempre
    // canSendAlert — uma regra só, testada, para os dois jobs.
    if (prefsError) {
      console.error(`[cron] disconnect_alert: falha lendo tenant_settings de ${org.id}:`, prefsError.message);
      results.errors++;
    }
    if (!canSendAlert({ value: prefs?.disconnect_alert_enabled, error: prefsError })) continue;

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

  // --- Job 4: Relatório semanal (só segundas, America/Sao_Paulo) ---
  if (isMondayInSaoPaulo(now)) {
    const windows = weekWindowsInSaoPaulo(now);

    const { data: allOrgs } = await supabase.from("organizations").select("id");

    for (const org of allOrgs ?? []) {
      // Opt-out: sem linha em tenant_settings = habilitado por padrão; erro de
      // leitura = não envia. A regra vive em canSendAlert (ver alert-optout.ts).
      const { data: settings, error: settingsError } = await supabase
        .from("tenant_settings")
        .select("weekly_report_enabled")
        .eq("tenant_id", org.id)
        .maybeSingle();

      if (settingsError) {
        console.error(`[cron] weekly_report: falha lendo tenant_settings de ${org.id}:`, settingsError.message);
        results.errors++;
      }
      if (!canSendAlert({ value: settings?.weekly_report_enabled, error: settingsError })) continue;

      // Já enviado nesta semana? (dedupe: notification criada de hoje em diante)
      // Se a checagem falhar não dá pra saber se já foi — pula, porque reenviar
      // é pior que atrasar o relatório uma semana.
      const { data: alreadySent, error: dedupeError } = await supabase
        .from("notifications")
        .select("id")
        .eq("tenant_id", org.id)
        .eq("type", "weekly_report")
        .gte("created_at", windows.currentWeekEndIso)
        .maybeSingle();

      if (dedupeError) {
        console.error(`[cron] weekly_report: falha no dedupe de ${org.id}:`, dedupeError.message);
        results.errors++;
        continue;
      }

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

      const stats = await buildWeeklyStats(supabase, org.id, windows);
      const tpl = weeklyReportEmail(name, appUrl, stats);
      const sent = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });

      if (sent) {
        results.weekly_sent++;
        // Se o registro falhar o e-mail já foi — o dedupe da próxima rodada
        // não vai encontrar nada e reenviaria. Precisa aparecer no resultado.
        const { error: notifError } = await supabase.from("notifications").insert({
          tenant_id: org.id,
          user_id: owner.user_id,
          type: "weekly_report",
          title: "Relatório semanal",
          body: "Enviamos o resumo semanal por e-mail.",
        });
        if (notifError) {
          console.error(`[cron] weekly_report: enviado para ${org.id} mas notification não registrada:`, notifError.message);
          results.errors++;
        }
      } else {
        results.errors++;
      }
    }
  }

  return Response.json({
    ok: true,
    ...results,
    timestamp: now.toISOString(),
  });
}
