import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { PlaybookStepKey } from "@/lib/playbook/steps";

const TABLE = "playbook_progress";

/** Marcações persistidas do tenant → { step_key: done_at }. */
export async function getPlaybookProgress(
  tenantId: string,
): Promise<Partial<Record<PlaybookStepKey, string>>> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("step_key, done_at")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  const out: Partial<Record<PlaybookStepKey, string>> = {};
  for (const r of data ?? []) out[r.step_key as PlaybookStepKey] = r.done_at;
  return out;
}

/**
 * Marca um passo como concluído. Idempotente com `ignoreDuplicates` — se já existe,
 * mantém o done_at original (uma vez marcado, fica; não re-carimba o tempo).
 */
export async function markPlaybookStep(tenantId: string, stepKey: PlaybookStepKey): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      { tenant_id: tenantId, step_key: stepKey, done_at: new Date().toISOString() },
      { onConflict: "tenant_id,step_key", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}
