import { jidDigits } from "@/lib/evolution/admin-group";
import { buildBulkJobs, type BulkJobInsert, type BulkTargetGroup } from "./bulk-batch";

/**
 * Detecção de duplicado e do alvo de "remover pessoa de todos os grupos",
 * dentro de UMA campanha. Função PURA — sem Supabase, sem rede.
 *
 * A chave de identidade é `participant_lid`, não telefone: produção está
 * ~100% em `@lid` (ver `[[whatsapp-regime-lid-medido]]`), e `phone` é
 * enriquecimento opcional (~82% de cobertura) vindo de `group_participants`
 * (Fase 3 de Comunidades, já alimentada pelo sync — sem chamada nova à
 * Evolution). Quem não tem telefone conhecido é reportado, mas nunca vira
 * job de remoção: a Evolution só aceita telefone em `updateParticipant`, e
 * inventar um número pra fechar a conta é pior do que deixar de fora.
 */

export type ParticipantRow = {
  whatsappGroupId: string;
  participantLid: string;
  phone: string | null;
};

export type DuplicateEntry = {
  participantLid: string;
  /** Dígitos normalizados, ou `null` se `group_participants` não tem telefone pra este LID. */
  phone: string | null;
  keepGroupId: string;
  removeFromGroupIds: string[];
};

/**
 * Quem aparece em mais de um grupo de `groupIds`. Mantém no PRIMEIRO grupo em
 * que a pessoa aparece, na ordem de `groupIds` (que é a ordem de
 * `campaign_groups.group_ids` — ver `selectBulkTargets`); remove dos demais.
 */
export function findDuplicates(
  groupIds: readonly string[],
  rows: readonly ParticipantRow[],
): DuplicateEntry[] {
  const escopo = new Set(groupIds);
  const gruposPorLid = new Map<string, Set<string>>();
  const telefonePorLid = new Map<string, string>();

  for (const row of rows) {
    if (!escopo.has(row.whatsappGroupId)) continue;

    if (!gruposPorLid.has(row.participantLid)) gruposPorLid.set(row.participantLid, new Set());
    gruposPorLid.get(row.participantLid)!.add(row.whatsappGroupId);

    if (row.phone && !telefonePorLid.has(row.participantLid)) {
      const digitos = jidDigits(row.phone);
      if (digitos) telefonePorLid.set(row.participantLid, digitos);
    }
  }

  const duplicados: DuplicateEntry[] = [];
  for (const [lid, grupos] of gruposPorLid) {
    if (grupos.size < 2) continue;
    const keepGroupId = groupIds.find((id) => grupos.has(id));
    if (!keepGroupId) continue; // defensivo: `grupos` só tem ids do próprio `escopo`.

    duplicados.push({
      participantLid: lid,
      phone: telefonePorLid.get(lid) ?? null,
      keepGroupId,
      removeFromGroupIds: groupIds.filter((id) => id !== keepGroupId && grupos.has(id)),
    });
  }
  return duplicados;
}

/**
 * Grupos administrados da campanha onde este telefone aparece — o alvo de
 * "remover pessoa de todos os grupos". `phone` é o que o lojista digitou;
 * normalizado aqui do mesmo jeito que o telefone gravado, pra casar mesmo com
 * formatação diferente (com/sem `+`, DDI, etc).
 */
export function planRemovePhoneEverywhere(
  phone: string,
  groupIds: readonly string[],
  rows: readonly ParticipantRow[],
): string[] {
  const alvo = jidDigits(phone);
  if (!alvo) return [];

  const escopo = new Set(groupIds);
  const encontrados = new Set<string>();
  for (const row of rows) {
    if (!escopo.has(row.whatsappGroupId)) continue;
    if (row.phone && jidDigits(row.phone) === alvo) encontrados.add(row.whatsappGroupId);
  }
  return groupIds.filter((id) => encontrados.has(id));
}

/**
 * Vira jobs `remove_participant`. Um `buildBulkJobs` por telefone: a Evolution
 * recebe um telefone por chamada, e cada entrada pode ter um conjunto
 * diferente de grupos-alvo — não é o mesmo padrão "uma carga pra todo mundo"
 * de foto/descrição.
 */
export function toRemoveParticipantJobs(
  entries: readonly { phone: string; groupIds: readonly string[] }[],
  targetsByWhatsappId: ReadonlyMap<string, BulkTargetGroup>,
  common: { tenantId: string; campaignGroupId: string; batchId: string },
): BulkJobInsert[] {
  const jobs: BulkJobInsert[] = [];
  for (const entry of entries) {
    const groups = entry.groupIds
      .map((id) => targetsByWhatsappId.get(id))
      .filter((g): g is BulkTargetGroup => Boolean(g));
    if (groups.length === 0) continue;

    jobs.push(
      ...buildBulkJobs({
        ...common,
        action: "remove_participant",
        groups,
        targetPhone: entry.phone,
      }),
    );
  }
  return jobs;
}
