import "server-only";

import { deriveHealth, type InstanceHealthRow, type NumberHealth } from "@/lib/instance-health";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Leitura do estado anti-ban por número, via RPC `public.instance_health`.
 *
 * A RPC recebe o tenant e filtra por ele lá dentro — service-role bypassa RLS,
 * então esse filtro é a proteção real (ver "Isolamento multi-tenant" no
 * CLAUDE.md). Não existe caminho aqui que leia instância de outro tenant.
 */
export async function getInstanceHealth(tenantId: string): Promise<NumberHealth[]> {
  const { data, error } = await getSupabaseAdmin().rpc("instance_health", {
    target_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message);

  const now = new Date();
  return ((data ?? []) as InstanceHealthRow[]).map((row) => deriveHealth(row, now));
}
