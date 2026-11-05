import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Respostas prontas da loja (spec §7.8): até 50, título até 40 e texto até 1000 caracteres. */

export type CannedReplyRow = { id: string; tenant_id: string; title: string; text: string; created_at: string };

const COLS = "id, tenant_id, title, text, created_at";

export const CANNED_REPLIES_LIMIT = 50;

/** A loja já tem 50: o trigger do banco recusa a 51ª. */
export class CannedRepliesLimitError extends Error {
  constructor() {
    super("Limite de 50 respostas prontas");
  }
}

export async function listCannedReplies(tenantId: string): Promise<CannedReplyRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_canned_replies")
    .select(COLS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(CANNED_REPLIES_LIMIT);
  if (error) throw new Error(error.message);
  return (data as unknown as CannedReplyRow[] | null) ?? [];
}

export async function createCannedReply(tenantId: string, input: { title: string; text: string }): Promise<CannedReplyRow> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_canned_replies")
    .insert({ tenant_id: tenantId, title: input.title.trim(), text: input.text.trim() })
    .select(COLS)
    .single();
  if (error) {
    if (error.code === "P0001" || error.message.includes("ig_canned_replies_limit")) throw new CannedRepliesLimitError();
    throw new Error(error.message);
  }
  return data as unknown as CannedReplyRow;
}

/** `false` = não existe nesta loja. */
export async function deleteCannedReply(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("ig_canned_replies").delete().eq("tenant_id", tenantId).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return ((data as unknown[] | null) ?? []).length > 0;
}
