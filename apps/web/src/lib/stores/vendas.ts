import "server-only";

import type { TenantRole } from "@/lib/permissions";
import type { Lead } from "@/lib/stores/leads";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { monthRange } from "@/lib/vendas/month";
import type { VendaDoMes, VendasDoMes } from "@/lib/vendas/tipos";

/**
 * Vendas registradas pela vendedora (spec 2026-10-07): pedido com itens e
 * autora. Tudo passa pelo service-role, que ignora o RLS — o
 * `.eq("tenant_id")` de cada query é a proteção real.
 */

/** Até quando a vendedora corrige ou apaga a própria venda. A RPC `replace_order_items` usa o mesmo corte. */
export const SALE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** O PostgREST corta em 1000 linhas sem erro: passou disso, a lista avisa que é parcial. */
const MONTH_LIMIT = 1000;
/** 100 UUIDs numa URL dão ~4 KB; 1000 passariam dos ~8 KB que o servidor aceita. */
const NAME_BATCH = 100;

/** Quem chama a rota: a loja, a pessoa e o papel dela na loja. */
export type SalesCaller = { tenantId: string; authUserId: string; role: TenantRole };
/** Item no formato de `p_items` das RPCs; a ordem do array vira `position`. */
export type RpcItem = { name: string; quantity: number; unit_price: number };
/** O lead que a venda usa: nome pra tela, telefone pro pedido, origem pra campanha. */
export type SaleLead = Pick<Lead, "id" | "name" | "phone" | "source_campaign" | "source_group_id" | "source_group_name">;
/** Linha de `public.orders` como as RPCs devolvem. */
export type SaleOrder = {
  id: string;
  tenant_id: string;
  phone: string;
  lead_id: string | null;
  group_name: string | null;
  campaign_id: string | null;
  value: number;
  created_at: string;
  created_by: string | null;
};

type StoredItem = RpcItem & { position: number };
type SaleRow = Pick<SaleOrder, "id" | "lead_id" | "phone" | "value" | "created_at" | "created_by"> & {
  order_items: StoredItem[];
};

const LEAD_COLUMNS = "id, name, phone, source_campaign, source_group_id, source_group_name";
const SALE_COLUMNS = "id, lead_id, phone, value, created_at, created_by, order_items(name, quantity, unit_price, position)";

/** Arredonda em centavos, como o numeric(12,2) do banco. */
export function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Lead da loja com um desses telefones; havendo dois, o que entrou por último. */
export async function findLeadByPhones(tenantId: string, phones: string[]): Promise<SaleLead | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("phone", phones)
    .order("entered_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as SaleLead[])[0] ?? null;
}

/** Lead da loja pelo id. null se não existe ou é de outra loja. */
export async function findLeadById(tenantId: string, id: string): Promise<SaleLead | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SaleLead | null) ?? null;
}

/**
 * Algum dos telefones está no descadastro? `isOptedOut` compara um número
 * exato; aqui o mesmo cliente pode estar com ou sem 55 e 9º dígito.
 */
export async function isOptedOutAny(tenantId: string, phones: string[]): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("optouts")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("phone", phones)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * Pedido + itens numa transação (`create_order_with_items`). Exceção da RPC sai com a mensagem dela.
 *
 * A RPC NÃO confere se `leadId` e `campaignId` são do tenant: quem chama só
 * pode passar ids que ele mesmo resolveu com uma query filtrada por tenant
 * (`findLeadByPhones` / `findLeadById`), nunca um id vindo do cliente.
 */
export async function createSale(input: {
  caller: SalesCaller;
  leadId: string | null;
  phone: string;
  groupName: string | null;
  campaignId: string | undefined;
  items: RpcItem[];
}): Promise<SaleOrder> {
  const { data, error } = await getSupabaseAdmin().rpc("create_order_with_items", {
    p_tenant_id: input.caller.tenantId,
    p_created_by: input.caller.authUserId,
    p_lead_id: input.leadId,
    p_phone: input.phone,
    p_group_name: input.groupName,
    p_campaign_id: input.campaignId ?? null,
    p_items: input.items,
  });
  if (error) throw new Error(error.message);
  return data as SaleOrder;
}

/** Troca os itens e recalcula o total. Vendedora: só a própria e até 24h (senão `fora_da_janela`). */
export async function replaceSaleItems(caller: SalesCaller, orderId: string, items: RpcItem[]): Promise<SaleOrder> {
  const { data, error } = await getSupabaseAdmin().rpc("replace_order_items", {
    p_tenant_id: caller.tenantId,
    p_order_id: orderId,
    p_items: items,
    p_only_author: caller.role === "seller" ? caller.authUserId : null,
  });
  if (error) throw new Error(error.message);
  return data as SaleOrder;
}

/** Apaga a venda (os itens vão junto, `on delete cascade`). true só se uma linha saiu. */
export async function deleteSale(caller: SalesCaller, orderId: string, now: Date): Promise<boolean> {
  let query = getSupabaseAdmin().from("orders").delete().eq("tenant_id", caller.tenantId).eq("id", orderId);
  if (caller.role === "seller") {
    query = query
      .eq("created_by", caller.authUserId)
      .gt("created_at", new Date(now.getTime() - SALE_EDIT_WINDOW_MS).toISOString());
  }
  const { data, error } = await query.select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * Nome de cada lead. `orders.lead_id` não tem FK para `leads`, então o nome
 * não vem embutido no pedido: busca à parte, em lotes de 100 ids.
 */
export async function leadNames(tenantId: string, ids: (string | null)[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  const batches = Array.from({ length: Math.ceil(unique.length / NAME_BATCH) }, (_, index) =>
    unique.slice(index * NAME_BATCH, (index + 1) * NAME_BATCH),
  );
  const replies = await Promise.all(
    batches.map((batch) => getSupabaseAdmin().from("leads").select("id, name").eq("tenant_id", tenantId).in("id", batch)),
  );
  return new Map(
    replies.flatMap(({ data, error }) => {
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; name: string | null }[]).map((lead) => [lead.id, lead.name] as const);
    }),
  );
}

/** Vendedora corrige a própria venda até 24h; dono, admin e operador, qualquer uma. */
export function isSaleEditable(
  caller: SalesCaller,
  sale: { created_by: string | null; created_at: string },
  now: Date,
): boolean {
  if (caller.role !== "seller") return true;
  return sale.created_by === caller.authUserId && now.getTime() - Date.parse(sale.created_at) < SALE_EDIT_WINDOW_MS;
}

function toVendaDoMes(row: SaleRow, client: string | null, caller: SalesCaller, now: Date): VendaDoMes {
  return {
    id: row.id,
    cliente: client,
    telefone: row.phone,
    total: row.value,
    criadaEm: row.created_at,
    itens: [...row.order_items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({ nome: item.name, quantidade: item.quantity, valorUnitario: item.unit_price })),
    editavel: isSaleEditable(caller, row, now),
  };
}

/** A venda que a RPC acabou de gravar, com os itens enviados (na ordem que virou `position`). */
export function saleFromOrder(
  order: SaleOrder,
  items: RpcItem[],
  client: string | null,
  caller: SalesCaller,
  now: Date,
): VendaDoMes {
  return toVendaDoMes({ ...order, order_items: items.map((item, position) => ({ ...item, position })) }, client, caller, now);
}

/**
 * As vendas de quem chama no mês de Brasília, mais recentes primeiro. Passou
 * de 1000: `truncado`, e o total é o das linhas que vieram (a tela avisa).
 */
export async function listMonthSales(caller: SalesCaller, month: string, now: Date): Promise<VendasDoMes> {
  const { start, end } = monthRange(month);
  const { data, error, count } = await getSupabaseAdmin()
    .from("orders")
    .select(SALE_COLUMNS, { count: "exact" })
    .eq("tenant_id", caller.tenantId)
    .eq("created_by", caller.authUserId)
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false })
    .limit(MONTH_LIMIT);
  if (error) throw new Error(error.message);
  // Contagem que não veio é erro, nunca um "não truncou" que ninguém mediu.
  if (count === null || !Number.isInteger(count)) throw new Error("Contagem das vendas não veio.");
  const rows = (data ?? []) as unknown as SaleRow[];
  const names = await leadNames(caller.tenantId, rows.map((row) => row.lead_id));
  const vendas = rows.map((row) =>
    toVendaDoMes(row, row.lead_id ? (names.get(row.lead_id) ?? null) : null, caller, now),
  );
  return {
    mes: month,
    total: toCents(vendas.reduce((sum, venda) => sum + venda.total, 0)),
    quantidade: count,
    truncado: count > rows.length,
    vendas,
  };
}
