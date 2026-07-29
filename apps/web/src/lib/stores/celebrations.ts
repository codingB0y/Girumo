import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "celebrations";

/** marker_keys já celebrados pelo tenant (dedupe do modal). */
export async function getCelebratedKeys(tenantId: string): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("marker_key")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.marker_key as string);
}

/** Marca um marco como celebrado. Idempotente (mantém o 1º celebrated_at). */
export async function markCelebrated(tenantId: string, markerKey: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      { tenant_id: tenantId, marker_key: markerKey },
      { onConflict: "tenant_id,marker_key", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}
