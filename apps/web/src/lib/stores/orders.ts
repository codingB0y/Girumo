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

/**
 * Pedidos do tenant criados desde `desde` (ISO), mais recentes primeiro, só com
 * o que a faixa da Início soma: valor e quando. A Início recarrega a cada
 * minuto e lia o histórico inteiro com todas as colunas.
 *
 * ponytail: o PostgREST para em 1000 linhas sem erro — loja com mais de 1000
 * pedidos no mês subconta o faturamento; somar no banco quando alguma passar.
 */
export async function listOrdersSince(
  tenantId: string,
  desde: string,
): Promise<Pick<Order, "id" | "value" | "created_at">[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("id, value, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
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
 * O tenant tem exatamente um pedido? Lê no máximo 2 ids em vez de contar: a contagem varre todos os
 * pedidos da loja, e a cada venda criada (a importação de 90 dias do Bling) isso vira O(n²).
 */
export async function hasExactlyOneOrder(tenantId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("orders").select("id").eq("tenant_id", tenantId).limit(2);
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
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
