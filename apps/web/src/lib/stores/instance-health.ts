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

/** O que `public.avaliar_disjuntor_saidas` devolve; `novo` = acabou de abrir agora. */
export type DisjuntorSaidas = {
  aberto: boolean;
  novo?: boolean;
  ate?: string;
  saidas?: number;
  limite?: number;
  cancelados?: number;
  motivo?: string;
};

/**
 * Disjuntor do anti-ban por saídas voluntárias (migração 20261023120000): conta
 * as saídas das últimas 3 h da loja e, passando do limite, pausa os envios por
 * 6 h, cancela a fila e notifica. A RPC recebe o tenant e filtra por ele.
 */
export async function avaliarDisjuntorSaidas(tenantId: string): Promise<DisjuntorSaidas> {
  const { data, error } = await getSupabaseAdmin().rpc("avaliar_disjuntor_saidas", {
    p_tenant: tenantId,
  });
  if (error) throw new Error(error.message);
  return data as DisjuntorSaidas;
}
