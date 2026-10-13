import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type Order = {
  id: string;
  phone: string;
  lead_id?: string | null;
  group_name?: string | null;
  /** Campanha de origem (inferida do lead no registro); null = sem origem. */
  campaign_id?: string | null;
  value: number;
  tenant_id?: string;
  created_at?: string;
};

/**
 * Pedidos do tenant, mais recentes primeiro.
 *
 * Parametrizado de propósito: a versão que derivava o tenant da sessão por
 * conta própria era a única das dez cargas da Início que ignorava o header
 * `x-tenant-id`, então quem pertence a duas organizações via os pedidos da
 * primeira enquanto o resto da tela falava da segunda.
 */
export async function listOrdersByTenant(tenantId: string): Promise<Order[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

/** Total de pedidos do tenant. */
export async function countOrders(tenantId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * O tenant vem da rota (`getRouteTenantContext`), como no `listOrdersByTenant`:
 * a versão que lia a primeira membership da sessão gravava o pedido na loja
 * errada para quem pertence a duas — a vendedora com loja própria convidada
 * para outra, por exemplo.
 */
export async function addOrder(
  tenantId: string,
  input: {
    phone?: string;
    leadId?: string;
    group?: string;
    campaignId?: string;
    value: number;
  },
): Promise<Order> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .insert({
      tenant_id: tenantId,
      phone: (input.phone ?? "").replace(/\D/g, ""),
      lead_id: input.leadId || null,
      group_name: input.group || null,
      campaign_id: input.campaignId || null,
      value: input.value,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Order;
}

/** true só se uma linha foi apagada: pedido de outra loja ou inexistente devolve false. */
export async function removeOrder(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
