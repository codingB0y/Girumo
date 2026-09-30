import "server-only";
import type { MovimentoDeMembros } from "@/lib/groups/member-events";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Grava quem entrou ou saiu de um grupo (`group_member_events`).
 *
 * Só grupo da loja onde ela é admin, a mesma regra da captura de leads: a
 * instância também está em grupos de terceiros, e a lista de quem entra neles
 * não pertence a ninguém aqui.
 *
 * Reentrega e o mesmo aviso chegando pelos dois números da loja caem no índice
 * único e viram no-op (`on conflict do nothing`). Devolve quantas pessoas o aviso
 * trazia, ou 0 quando o grupo não é da loja.
 */
export async function recordGroupMemberEvents(
  tenantId: string,
  whatsappGroupId: string,
  movimento: MovimentoDeMembros,
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data: grupo, error: grupoError } = await supabase
    .from("groups")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("whatsapp_group_id", whatsappGroupId)
    .eq("is_admin", true)
    .maybeSingle();
  if (grupoError) throw new Error(grupoError.message);
  if (!grupo) return 0;

  const linhas = movimento.participants.map((participant) => ({
    tenant_id: tenantId,
    whatsapp_group_id: whatsappGroupId,
    participant,
    kind: movimento.kind,
    occurred_at: movimento.occurredAt,
  }));
  const { error } = await supabase
    .from("group_member_events")
    .upsert(linhas, { onConflict: "tenant_id,whatsapp_group_id,occurred_at,participant,kind", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return linhas.length;
}
