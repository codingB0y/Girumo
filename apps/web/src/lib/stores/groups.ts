import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type Group = {
  id: string;
  tenant_id: string;
  whatsapp_group_id: string;
  name: string;
  display_name_base?: string;
  display_number?: number;
  members: number;
  capacity: number;
  selected: boolean;
  engagement: "alto" | "medio" | "baixo";
  /** Se a conta conectada é admin do grupo. Só grupo admin entra em sync/disparo. */
  is_admin?: boolean;
  invite_url?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const TABLE = "groups";

export async function listGroups(tenantId: string): Promise<Group[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function upsertGroupsBatch(
  tenantId: string,
  groups: Array<Omit<Group, "id" | "tenant_id" | "created_at" | "updated_at" | "metadata"> & { id?: string }>,
): Promise<Group[]> {
  if (groups.length === 0) return [];
  const rows = groups.map((g) => ({ ...g, tenant_id: tenantId }));
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(rows, { onConflict: "tenant_id,whatsapp_group_id" })
    .select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Sync vindo do provedor (Evolution `fetchAllGroups`).
 *
 * Grava SÓ o que o WhatsApp é dono: id do grupo, nome, nº de membros e se
 * somos admin. Os campos configurados no painel (`selected`, `capacity`,
 * `engagement`, `invite_url`) ficam de fora do payload de propósito — o ON
 * CONFLICT só atualiza colunas presentes, então um sync não apaga a seleção do
 * lojista. Em linha nova, o default da tabela cobre cada um deles.
 */
export async function syncGroupsFromProvider(
  tenantId: string,
  groups: Array<{ whatsapp_group_id: string; name: string; members: number; is_admin: boolean }>,
): Promise<number> {
  if (groups.length === 0) return 0;
  const rows = groups.map((g) => ({ ...g, tenant_id: tenantId }));
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(rows, { onConflict: "tenant_id,whatsapp_group_id" })
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function updateGroup(tenantId: string, id: string, patch: Partial<Group>): Promise<Group | null> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenant_id, created_at, ...safePatch } = patch as Record<string, unknown>;
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(safePatch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
