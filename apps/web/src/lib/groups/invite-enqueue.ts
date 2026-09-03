import type { BulkTargetGroup } from "@/lib/groups/bulk-batch";

export type GrupoParaConvite = {
  id: string;
  whatsapp_group_id: string | null;
  is_admin?: boolean;
  invite_url?: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Backfill de convite pela fila do lote (substitui o cron diário de 10/dia).
 * `metadata.inviteFetch` é o marcador de falha definitiva do backfill antigo:
 * grupo marcado só volta por PATCH manual (clearInviteFetchError), nunca sozinho.
 */
export function selecionarGruposSemConvite(
  groups: readonly GrupoParaConvite[],
  jaNaFila: ReadonlySet<string>,
): BulkTargetGroup[] {
  return groups
    .filter(
      (g) =>
        g.is_admin === true &&
        !g.invite_url &&
        !!g.whatsapp_group_id &&
        g.metadata?.inviteFetch === undefined &&
        !jaNaFila.has(g.id),
    )
    .map((g) => ({ id: g.id, whatsapp_group_id: g.whatsapp_group_id }));
}
