import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type TenantSettings = {
  tenantId: string;
  weeklyReportEnabled: boolean;
  monthlyGoalContacts: number | null;
  monthlyGoalRevenue: number | null;
  onboardingDismissedAt: string | null;
  onboardingCompletedAt: string | null;
  updatedAt?: string;
};

const DEFAULT_WEEKLY_REPORT_ENABLED = true;

const BASE_COLUMNS =
  "tenant_id, weekly_report_enabled, monthly_goal_contacts, monthly_goal_revenue, updated_at";
const ONBOARDING_COLUMNS = "onboarding_dismissed_at, onboarding_completed_at";
const ALL_COLUMNS = `${BASE_COLUMNS}, ${ONBOARDING_COLUMNS}`;

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
  monthly_goal_contacts?: number | null;
  monthly_goal_revenue?: number | null;
  onboarding_dismissed_at?: string | null;
  onboarding_completed_at?: string | null;
  updated_at?: string;
};

function toSettings(tenantId: string, row: SettingsRow | null): TenantSettings {
  return {
    tenantId,
    weeklyReportEnabled: row?.weekly_report_enabled ?? DEFAULT_WEEKLY_REPORT_ENABLED,
    monthlyGoalContacts: row?.monthly_goal_contacts ?? null,
    monthlyGoalRevenue: row?.monthly_goal_revenue ?? null,
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
  if (isMissingColumn(error)) ({ data, error } = await read(BASE_COLUMNS));
  if (error) throw new Error(error.message);
  return toSettings(tenantId, data as SettingsRow | null);
}

export type TenantSettingsInput = {
  weeklyReportEnabled?: boolean;
  monthlyGoalContacts?: number | null;
  monthlyGoalRevenue?: number | null;
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

  const write = (patch: Record<string, unknown>, columns: string) =>
    getSupabaseAdmin()
      .from("tenant_settings")
      .upsert(patch, { onConflict: "tenant_id" })
      .select(columns)
      .single();

  let { data, error } = await write({ ...base, ...onboarding }, ALL_COLUMNS);
  // Banco ainda sem as colunas de onboarding: grava o que dá (metas, relatório)
  // em vez de derrubar o PATCH inteiro. O dismiss não persiste até a migração.
  if (isMissingColumn(error)) ({ data, error } = await write(base, BASE_COLUMNS));
  if (error) throw new Error(error.message);
  return toSettings(tenantId, data as SettingsRow);
}
