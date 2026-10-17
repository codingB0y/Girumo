/**
 * Regras dos avisos automáticos do sino (`api/notifications/alerts`), puras para
 * serem testadas sem banco. As duas existem porque os avisos mentiam: "57 grupos
 * sem convite" numa loja com 56 configurados, e "campanha parada" na loja com
 * 658 cliques nos mesmos 3 dias.
 */

/** Grupos sem link de convite. Texto em branco conta como sem convite. */
export function gruposSemConvite<T extends { invite_url?: string | null }>(grupos: readonly T[]): T[] {
  return grupos.filter((g) => !g.invite_url?.trim());
}

/**
 * Campanhas paradas: sem edição desde `desde` E sem clique no período.
 *
 * `updated_at` sozinho não diz nada sobre atividade — só muda quando o lojista
 * edita a campanha, nunca num clique ou numa entrada. Por isso quem chama lê os
 * cliques do período e passa em `comClique`.
 */
export function campanhasParadas<T extends { id: string; updated_at: string | null }>(
  campanhas: readonly T[],
  desde: string,
  comClique: ReadonlySet<string> = new Set(),
): T[] {
  const limite = Date.parse(desde);
  return campanhas.filter((c) => {
    const editadaEm = c.updated_at ? Date.parse(c.updated_at) : NaN;
    return Number.isFinite(editadaEm) && editadaEm < limite && !comClique.has(c.id);
  });
}
