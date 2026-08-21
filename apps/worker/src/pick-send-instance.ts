/**
 * Escolhe a instância que vai ENVIAR a mensagem de uma automação.
 *
 * Existe porque `enqueueMessage` gravava `instance_id: null` fixo, e
 * `app.claim_send_commands` filtra `cand.instance_id is not null` — todo
 * comando de automação ficava em `queued` para sempre, sem erro, sem
 * tentativa e sem ninguém para reclamar. O `send-command.ts` até trata
 * "comando sem instance_id", mas nunca é alcançado: o claim descarta antes.
 *
 * Sem I/O de propósito, para rodar sob `tsx --test`.
 */

export type InstanceRow = {
  id: string;
  status: string | null;
  /** Nome na Evolution. Sem ele o envio falha lá na frente, então não serve. */
  provider_instance_id: string | null;
  created_at: string;
};

/** Estados em que a instância está apta a receber comando de envio. */
const PREFERRED_STATUS = "connected";

/**
 * Devolve o id da instância escolhida, ou null se o tenant não tem nenhuma
 * utilizável.
 *
 * Regras, nesta ordem:
 *  1. Descarta quem não tem `provider_instance_id` — não está provisionada na
 *     Evolution, e o envio falharia em `instanceName()` de qualquer jeito.
 *  2. Prefere `connected`.
 *  3. NÃO exige `connected`: uma instância que caiu tende a voltar, e o
 *     comando esperando na fila é melhor que o run falhando. O gate anti-ban
 *     e o `send-command` cuidam do resto.
 *  4. Desempata pela mais antiga, para a escolha ser estável entre ciclos —
 *     alternar instância a cada passo espalharia os envios de um mesmo run
 *     por números diferentes.
 */
export function pickSendInstance(rows: readonly InstanceRow[]): string | null {
  const usable = rows.filter((row) => Boolean(row.provider_instance_id));
  if (usable.length === 0) return null;

  const connected = usable.filter((row) => row.status === PREFERRED_STATUS);
  const pool = connected.length > 0 ? connected : usable;

  // `reduce` em vez de `sort()[0]`: `pool` nunca é vazio aqui, mas o índice 0
  // de um array é `T | undefined` para o compilador, e um `!` esconderia isso.
  const oldest = pool.reduce((best, row) => {
    const byDate = row.created_at.localeCompare(best.created_at);
    const menor = byDate !== 0 ? byDate < 0 : row.id.localeCompare(best.id) < 0;
    return menor ? row : best;
  });

  return oldest.id;
}
