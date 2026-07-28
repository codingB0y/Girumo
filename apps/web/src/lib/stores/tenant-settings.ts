import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type TenantSettings = {
  tenantId: string;
  monthlyGoalContacts: number | null;
  monthlyGoalRevenue: number | null;
  updatedAt?: string;
};

export async function getTenantSettings(tenantId: string): Promise<TenantSettings> {
  const { data, error } = await getSupabaseAdmin()
    .from("tenant_settings")
    .select("tenant_id, monthly_goal_contacts, monthly_goal_revenue, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    tenantId,
    monthlyGoalContacts: data?.monthly_goal_contacts ?? null,
    monthlyGoalRevenue: data?.monthly_goal_revenue ?? null,
    updatedAt: data?.updated_at,
  };
}

export async function updateTenantSettings(
  tenantId: string,
  input: { monthlyGoalContacts?: number | null; monthlyGoalRevenue?: number | null },
): Promise<TenantSettings> {
  const patch: Record<string, unknown> = { tenant_id: tenantId, updated_at: new Date().toISOString() };
  if ("monthlyGoalContacts" in input) patch.monthly_goal_contacts = input.monthlyGoalContacts;
  if ("monthlyGoalRevenue" in input) patch.monthly_goal_revenue = input.monthlyGoalRevenue;

  const { data, error } = await getSupabaseAdmin()
    .from("tenant_settings")
    .upsert(patch, { onConflict: "tenant_id" })
    .select("tenant_id, monthly_goal_contacts, monthly_goal_revenue, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return {
    tenantId,
    monthlyGoalContacts: data.monthly_goal_contacts,
    monthlyGoalRevenue: data.monthly_goal_revenue,
    updatedAt: data.updated_at,
  };
}
