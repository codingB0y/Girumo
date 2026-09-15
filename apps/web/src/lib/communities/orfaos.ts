/** Grupo na ótica de pertencimento — só o que o cálculo precisa. */
export type GrupoRef = { whatsappGroupId: string };

/** Coleção na ótica de pertencimento. `groupIds` guarda whatsapp_group_id em produção. */
export type ColecaoRef = { groupIds: string[] | null };

/**
 * Grupos que não estão em nenhuma coleção.
 *
 * Em produção `campaign_groups.group_ids` guarda `whatsapp_group_id`, não UUID —
 * o seed de dev guarda UUID e mente sobre isso. Casar pelo mesmo campo dos dois
 * lados é o que impede o cálculo de dizer "91 órfãos" em produção.
 */
export function gruposOrfaos<T extends GrupoRef>(grupos: T[], colecoes: ColecaoRef[]): T[] {
  const atribuidos = new Set<string>();
  for (const colecao of colecoes) {
    for (const id of colecao.groupIds ?? []) atribuidos.add(id);
  }
  return grupos.filter((g) => !atribuidos.has(g.whatsappGroupId));
}
