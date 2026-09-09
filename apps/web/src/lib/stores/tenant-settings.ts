import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { SegmentId } from "@/lib/segments";

export type TenantSettings = {
  tenantId: string;
  weeklyReportEnabled: boolean;
  disconnectAlertEnabled: boolean;
  broadcastAlertEnabled: boolean;
  monthlyGoalContacts: number | null;
  monthlyGoalRevenue: number | null;
  /** Ramo do negócio (packs de conteúdo). Texto validado na API; null = neutro. */
  segment: string | null;
  onboardingDismissedAt: string | null;
  onboardingCompletedAt: string | null;
  updatedAt?: string;
};

// Todo alerta nasce ligado: a preferência só existe para quem quer DESligar, e
// quem nunca abriu a tela precisa continuar recebendo como antes da migration.
const DEFAULT_WEEKLY_REPORT_ENABLED = true;
const DEFAULT_DISCONNECT_ALERT_ENABLED = true;
const DEFAULT_BROADCAST_ALERT_ENABLED = true;

const BASE_COLUMNS =
  "tenant_id, weekly_report_enabled, monthly_goal_contacts, monthly_goal_revenue, updated_at";
const ONBOARDING_COLUMNS = "onboarding_dismissed_at, onboarding_completed_at";
const PREFERENCE_COLUMNS = "disconnect_alert_enabled, broadcast_alert_enabled";
const SEGMENT_COLUMNS = "segment";
/** Sem a coluna `segment` (banco anterior à migração 20260830233000). */
const LEGACY_ALL_COLUMNS = `${BASE_COLUMNS}, ${ONBOARDING_COLUMNS}, ${PREFERENCE_COLUMNS}`;
const ALL_COLUMNS = `${LEGACY_ALL_COLUMNS}, ${SEGMENT_COLUMNS}`;

/**
 * `42703` = coluna inexistente. Os dois bancos (dev e prod) recebem as migrações
 * à mão e em momentos diferentes, então o código pode chegar num banco antes da
 * coluna. Sem este guarda, um deploy fora de ordem derrubaria /api/settings
 * inteiro — meta do mês inclusive — por causa de uma coluna de onboarding.
 * Remover quando a migração 20260811000000 estiver aplicada nos dois.
 */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
}

type SettingsRow = {
  weekly_report_enabled?: boolean | null;
  disconnect_alert_enabled?: boolean | null;
  broadcast_alert_enabled?: boolean | null;
  monthly_goal_contacts?: number | null;
  monthly_goal_revenue?: number | null;
  segment?: string | null;
  onboarding_dismissed_at?: string | null;
  onboarding_completed_at?: string | null;
  updated_at?: string;
};

function toSettings(tenantId: string, row: SettingsRow | null): TenantSettings {
  return {
    tenantId,
    weeklyReportEnabled: row?.weekly_report_enabled ?? DEFAULT_WEEKLY_REPORT_ENABLED,
    disconnectAlertEnabled: row?.disconnect_alert_enabled ?? DEFAULT_DISCONNECT_ALERT_ENABLED,
    broadcastAlertEnabled: row?.broadcast_alert_enabled ?? DEFAULT_BROADCAST_ALERT_ENABLED,
    monthlyGoalContacts: row?.monthly_goal_contacts ?? null,
    monthlyGoalRevenue: row?.monthly_goal_revenue ?? null,
    segment: row?.segment ?? null,
    onboardingDismissedAt: row?.onboarding_dismissed_at ?? null,
    onboardingCompletedAt: row?.onboarding_completed_at ?? null,
    updatedAt: row?.updated_at,
  };
}

export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const read = (columns: string) =>
    getSupabaseAdmin()
      .from("tenant_settings")
      .select(columns)
      .eq("tenant_id", tenantId)
      .maybeSingle();

  let { data, error } = await read(ALL_COLUMNS);
  if (isMissingColumn(error)) ({ data, error } = await read(LEGACY_ALL_COLUMNS));
  if (isMissingColumn(error)) ({ data, error } = await read(BASE_COLUMNS));
  if (error) throw new Error(error.message);
  return toSettings(tenantId, data as SettingsRow | null);
}

export type TenantSettingsInput = {
  weeklyReportEnabled?: boolean;
  disconnectAlertEnabled?: boolean;
  broadcastAlertEnabled?: boolean;
  monthlyGoalContacts?: number | null;
  monthlyGoalRevenue?: number | null;
  segment?: SegmentId | null;
  onboardingDismissedAt?: string | null;
  onboardingCompletedAt?: string | null;
};

export async function updateTenantSettings(
  tenantId: string,
  input: TenantSettingsInput,
): Promise<TenantSettings> {
  const base: Record<string, unknown> = { tenant_id: tenantId, updated_at: new Date().toISOString() };
  if (typeof input.weeklyReportEnabled === "boolean") base.weekly_report_enabled = input.weeklyReportEnabled;
  if ("monthlyGoalContacts" in input) base.monthly_goal_contacts = input.monthlyGoalContacts;
  if ("monthlyGoalRevenue" in input) base.monthly_goal_revenue = input.monthlyGoalRevenue;

  const onboarding: Record<string, unknown> = {};
  if ("onboardingDismissedAt" in input) onboarding.onboarding_dismissed_at = input.onboardingDismissedAt;
  if ("onboardingCompletedAt" in input) onboarding.onboarding_completed_at = input.onboardingCompletedAt;

  const preferences: Record<string, unknown> = {};
  if (typeof input.disconnectAlertEnabled === "boolean") {
    preferences.disconnect_alert_enabled = input.disconnectAlertEnabled;
  }
  if (typeof input.broadcastAlertEnabled === "boolean") {
    preferences.broadcast_alert_enabled = input.broadcastAlertEnabled;
  }

  const segmento: Record<string, unknown> = {};
  if ("segment" in input) segmento.segment = input.segment ?? null;

  const write = (patch: Record<string, unknown>, columns: string) =>
    getSupabaseAdmin()
      .from("tenant_settings")
      .upsert(patch, { onConflict: "tenant_id" })
      .select(columns)
      .single();

  let { data, error } = await write({ ...base, ...onboarding, ...preferences, ...segmento }, ALL_COLUMNS);
  if (isMissingColumn(error)) {
    ({ data, error } = await write({ ...base, ...onboarding, ...preferences }, LEGACY_ALL_COLUMNS));
  }
  // Banco ainda sem as colunas de onboarding/preferências: grava o que dá (metas,
  // relatório) em vez de derrubar o PATCH inteiro. O dismiss e os opt-outs não
  // persistem até a migração — mas o cron falha fechado, então um opt-out perdido
  // aqui nunca vira e-mail indesejado: vira e-mail não enviado.
  if (isMissingColumn(error)) ({ data, error } = await write(base, BASE_COLUMNS));
  if (error) throw new Error(error.message);
  return toSettings(tenantId, data as SettingsRow);
}
