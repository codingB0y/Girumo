import type { BulkTargetGroup } from "@/lib/groups/bulk-batch";

export type GrupoParaConvite = {
  id: string;
  whatsapp_group_id: string | null;
  is_admin?: boolean;
  invite_url?: string | null;
  /** Veredito da última revisão (`groups.invite_check`) e quando foi. */
  invite_check?: string | null;
  invite_checked_at?: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Grupo revisado como `broken` descansa este tanto antes de voltar à fila. Sem
 * isso, um grupo em que a Evolution responde "No invite code / forbidden" (nunca
 * ganha `invite_url`) era reenfileirado a CADA sync: em prod um grupo de 1 membro
 * da loja piloto levou 26 leituras falhadas em 27 dias (13/10 a 08/11/2026) —
 * uma consulta de admin por dia num grupo que não muda, só para falhar de novo.
 * Uma semana é o bastante para o lojista corrigir o grupo (ou apagá-lo) e para o
 * WhatsApp não ver a mesma leitura inútil todo dia.
 */
export const REVISAO_QUEBRADA_REPOUSO_DIAS = 7;

function emRepouso(g: GrupoParaConvite, agora: Date): boolean {
  if (g.invite_check !== "broken" || !g.invite_checked_at) return false;
  const em = Date.parse(g.invite_checked_at);
  if (Number.isNaN(em)) return false;
  return agora.getTime() - em < REVISAO_QUEBRADA_REPOUSO_DIAS * 86_400_000;
}

/**
 * Backfill de convite pela fila do lote (substitui o cron diário de 10/dia).
 * `metadata.inviteFetch` é o marcador de falha definitiva do backfill antigo:
 * grupo marcado só volta por PATCH manual (clearInviteFetchError), nunca sozinho.
 */
export function selecionarGruposSemConvite(
  groups: readonly GrupoParaConvite[],
  jaNaFila: ReadonlySet<string>,
  agora: Date = new Date(),
): BulkTargetGroup[] {
  return groups
    .filter(
      (g) =>
        g.is_admin === true &&
        !g.invite_url &&
        !!g.whatsapp_group_id &&
        g.metadata?.inviteFetch === undefined &&
        !emRepouso(g, agora) &&
        !jaNaFila.has(g.id),
    )
    .map((g) => ({ id: g.id, whatsapp_group_id: g.whatsapp_group_id }));
}
