import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionAccountId } from "@/lib/session";

export type MessageTemplate = {
  id: string;
  name: string;
  category: "drop" | "welcome" | "recompra" | "pix" | "custom";
  body: string;
  uses: number;
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
export async function listTemplates(): Promise<MessageTemplate[]> {
  const tenantId = await getTenantId();
  const { data, error } = await getSupabaseAdmin()
    .from("templates")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MessageTemplate[];
}

export async function createTemplate(input: { name: string; category: string; body: string }): Promise<MessageTemplate> {
  const tenantId = await getTenantId();
  const { data, error } = await getSupabaseAdmin()
    .from("templates")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      category: input.category || "drop",
      body: input.body,
      uses: 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MessageTemplate;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const tenantId = await getTenantId();
  const { error } = await getSupabaseAdmin()
    .from("templates")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  return !error;
}
