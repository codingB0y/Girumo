import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionAccountId } from "@/lib/session";

export type Order = {
  id: string;
  phone: string;
  lead_id?: string | null;
  group_name?: string | null;
  value: number;
  tenant_id?: string;
  created_at?: string;
};

async function getTenantId(): Promise<string> {
  const userId = await getSessionAccountId();
  if (!userId) throw new Error("Não autenticado.");
  const { data } = await getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!data) throw new Error("Tenant não encontrado.");
  return data.tenant_id;
}

export async function listOrders(): Promise<Order[]> {
  const tenantId = await getTenantId();
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function addOrder(input: {
  phone?: string;
  leadId?: string;
  group?: string;
  value: number;
}): Promise<Order> {
  const tenantId = await getTenantId();
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .insert({
      tenant_id: tenantId,
      phone: (input.phone ?? "").replace(/\D/g, ""),
      lead_id: input.leadId || null,
      group_name: input.group || null,
      value: input.value,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Order;
}

export async function removeOrder(id: string): Promise<boolean> {
  const tenantId = await getTenantId();
  const { error } = await getSupabaseAdmin()
    .from("orders")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  return !error;
}
