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

/** Teto de linhas por página do PostgREST. Acima disso ele trunca em silêncio, sem erro. */
const PAGE_SIZE = 1000;

/**
 * Participantes de vários grupos de uma vez — usado pelo cálculo de cobertura
 * (`cobertura/route.ts`, que lê só `whatsappGroupId`/`participantLid`) e pela
 * detecção de duplicado (`duplicate-removal.ts`, que também precisa de
 * `phone`).
 *
 * Pagina em `PAGE_SIZE` porque um `.select()` sem `.range()` no Supabase
 * corta no teto padrão do PostgREST (1000 linhas) SEM erro — devolve uma
 * página parcial como se fosse o total. Um grupo grande sozinho já estoura
 * isso (medido: 1981 participantes numa única campanha de teste), e a
 * consequência não é "resultado incompleto e óbvio": é "zero duplicado
 * encontrado" quando as linhas do segundo grupo nunca chegam a entrar na
 * página, ou "alcance real" subcontado sem nenhum aviso na tela.
 */
export async function listarParticipantesDosGrupos(
  tenantId: string,
  whatsappGroupIds: string[],
): Promise<Array<{ whatsappGroupId: string; participantLid: string; phone: string | null }>> {
  const { tenantId: tid } = montarQueryParticipantes(tenantId);
  if (whatsappGroupIds.length === 0) return [];

  const linhas: Array<{ whatsappGroupId: string; participantLid: string; phone: string | null }> = [];
  let desde = 0;

  for (;;) {
    const { data, error } = await getSupabaseAdmin()
      .from(TABLE)
      .select("whatsapp_group_id, participant_lid, phone")
      .eq("tenant_id", tid)
      .in("whatsapp_group_id", whatsappGroupIds)
      .range(desde, desde + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const pagina = data ?? [];
    for (const r of pagina) {
      linhas.push({
        whatsappGroupId: r.whatsapp_group_id as string,
        participantLid: r.participant_lid as string,
        phone: (r.phone as string | null) ?? null,
      });
    }

    // Página incompleta é o sinal de fim — pedir a próxima só quando a atual
    // veio cheia evita uma chamada extra vazia no caso comum (poucas linhas).
    if (pagina.length < PAGE_SIZE) break;
    desde += PAGE_SIZE;
  }

  return linhas;
}
