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

export async function getGroup(tenantId: string, id: string): Promise<Group | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertGroup(
  tenantId: string,
  input: Omit<Group, "id" | "tenant_id" | "created_at" | "updated_at" | "metadata"> & { id?: string },
): Promise<Group> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        ...input,
        tenant_id: tenantId,
        ...(input.id ? { id: input.id } : {}),
      },
      { onConflict: "tenant_id,whatsapp_group_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
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

export async function deleteGroup(tenantId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
