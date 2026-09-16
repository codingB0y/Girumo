import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "group_participants";

export type ParticipanteEntrada = {
  participantLid: string;
  phone: string | null;
  isAdmin: boolean;
};

/**
 * Valida o tenant e devolve a query base. O service-role bypassa RLS — este
 * filtro é a única proteção real contra vazamento cross-tenant.
 */
export function montarQueryParticipantes(tenantId: string): { tenantId: string } {
  if (!tenantId) throw new Error("tenantId é obrigatório para consultar participantes");
  return { tenantId };
}

/**
 * Upsert em lote dos participantes de UM grupo, na mesma leitura que o sync
 * já fez (sem chamada nova à Evolution). `last_seen_at` sempre atualiza;
 * `first_seen_at` só é gravado no insert (default da coluna).
 */
export async function upsertParticipantesDoGrupo(
  tenantId: string,
  whatsappGroupId: string,
  participantes: ParticipanteEntrada[],
): Promise<void> {
  const { tenantId: tid } = montarQueryParticipantes(tenantId);
  if (participantes.length === 0) return;

  const rows = participantes.map((p) => ({
    tenant_id: tid,
    whatsapp_group_id: whatsappGroupId,
    participant_lid: p.participantLid,
    phone: p.phone,
    is_admin: p.isAdmin,
    last_seen_at: new Date().toISOString(),
  }));

  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(rows, { onConflict: "tenant_id,whatsapp_group_id,participant_lid" });
  if (error) throw new Error(error.message);
}

/** Participantes de vários grupos de uma vez — usado pelo cálculo de cobertura. */
export async function listarParticipantesDosGrupos(
  tenantId: string,
  whatsappGroupIds: string[],
): Promise<Array<{ whatsappGroupId: string; participantLid: string }>> {
  const { tenantId: tid } = montarQueryParticipantes(tenantId);
  if (whatsappGroupIds.length === 0) return [];

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("whatsapp_group_id, participant_lid")
    .eq("tenant_id", tid)
    .in("whatsapp_group_id", whatsappGroupIds);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    whatsappGroupId: r.whatsapp_group_id as string,
    participantLid: r.participant_lid as string,
  }));
}
