import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type TenantSettings = {
  tenantId: string;
  weeklyReportEnabled: boolean;
};

const DEFAULT_WEEKLY_REPORT_ENABLED = true;

export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const { data, error } = await getSupabaseAdmin()
    .from("tenant_settings")
    .select("weekly_report_enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    tenantId,
    weeklyReportEnabled: data?.weekly_report_enabled ?? DEFAULT_WEEKLY_REPORT_ENABLED,
  };
}

export async function updateTenantSettings(
  tenantId: string,
  partial: { weeklyReportEnabled?: boolean },
): Promise<TenantSettings> {
  if (typeof partial.weeklyReportEnabled !== "boolean") {
    return getTenantSettings(tenantId);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("tenant_settings")
    .upsert(
      { tenant_id: tenantId, weekly_report_enabled: partial.weeklyReportEnabled },
      { onConflict: "tenant_id" },
    )
    .select("weekly_report_enabled")
    .single();
  if (error) throw new Error(error.message);
  return { tenantId, weeklyReportEnabled: data.weekly_report_enabled };
}
