/**
 * Entradas nos grupos de uma campanha — função PURA, sem I/O.
 *
 * Substitui a "conversão clique→membro" que foi removida por ser fabricada:
 * ela era `totalMembers / clicks`, que conta quem já estava no grupo antes do
 * link existir e por isso passava de 100%.
 *
 * Aqui a base é `leads`, que registra ENTRADA (`entered_at` + `source_group_id`),
 * não o total acumulado. Um lead num grupo da campanha é alguém que entrou.
 *
 * O que este número NÃO é: prova de que a pessoa veio do link. O convite do
 * WhatsApp é o mesmo para todo mundo, então não existe identidade por clique —
 * alguém adicionado à mão entra na conta igual. Por isso o rótulo na tela fala
 * em "entradas", nunca em "conversão do link".
 */

export type EntryLead = {
  sourceGroupId?: string | null;
  enteredAt?: string | null;
};

/**
 * Quantas entradas foram registradas nos grupos desta campanha.
 *
 * `since` (opcional) descarta entradas anteriores a uma data — útil para não
 * contar quem entrou antes de a campanha existir.
 */
export function countCampaignEntries(
  leads: readonly EntryLead[],
  groupIds: readonly string[],
  opts?: { since?: string | null },
): number {
  if (groupIds.length === 0) return 0;
  const doPool = new Set(groupIds);
  const since = opts?.since ? Date.parse(opts.since) : null;
  const temCorte = since !== null && Number.isFinite(since);

  let total = 0;
  for (const lead of leads) {
    if (!lead.sourceGroupId || !doPool.has(lead.sourceGroupId)) continue;
    if (temCorte) {
      const quando = lead.enteredAt ? Date.parse(lead.enteredAt) : NaN;
      // Entrada sem data não pode ser datada: fica de fora quando há corte,
      // em vez de ser contada como se tivesse acontecido depois.
      if (!Number.isFinite(quando) || quando < (since as number)) continue;
    }
    total += 1;
  }
  return total;
}

/**
 * Entradas por clique, em %. `null` quando não há clique — sem denominador não
 * existe taxa, e mostrar 0% diria "ninguém converteu" no lugar de "ainda não
 * houve clique".
 *
 * Teto de 100%: entrada não é prova de origem no link, então a razão pode
 * passar de 1 legitimamente (gente adicionada à mão). Passar de 100% na tela
 * seria denunciar a métrica como quebrada — o teto mantém a leitura honesta
 * dentro do que ela sabe dizer.
 */
export function entriesPerClick(entries: number, clicks: number): number | null {
  if (clicks <= 0) return null;
  return Math.min(100, Math.round((entries / clicks) * 100));
}
