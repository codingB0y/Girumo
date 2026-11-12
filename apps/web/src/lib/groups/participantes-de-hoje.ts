/**
 * `group_participants` nunca apaga quem saiu: cada sync só regrava `last_seen_at` de quem está.
 * Conta como "hoje" só a linha lida até uma hora antes da leitura mais recente do grupo (medido em
 * prod em 12/11/2026: 1.028 linhas num grupo de 874 pessoas, 880 dentro da janela).
 *
 * A janela é relativa à última leitura de CADA grupo, não ao relógio: grupo que não sincroniza há
 * dias continua com a lista da última leitura dele, em vez de sumir.
 */
export const JANELA_DA_ULTIMA_LEITURA_MS = 60 * 60 * 1000;

export type LinhaLida = { whatsappGroupId: string; lastSeenAt: string };

/** As linhas de quem estava no grupo na leitura mais recente dele. Linha sem data válida fica fora. */
export function naUltimaLeitura<T extends LinhaLida>(linhas: readonly T[]): T[] {
  const ultimaLeitura = new Map<string, number>();
  for (const l of linhas) {
    const quando = Date.parse(l.lastSeenAt);
    if (Number.isNaN(quando)) continue;
    ultimaLeitura.set(l.whatsappGroupId, Math.max(ultimaLeitura.get(l.whatsappGroupId) ?? quando, quando));
  }

  return linhas.filter((l) => {
    const ultima = ultimaLeitura.get(l.whatsappGroupId);
    const quando = Date.parse(l.lastSeenAt);
    return ultima !== undefined && !Number.isNaN(quando) && quando >= ultima - JANELA_DA_ULTIMA_LEITURA_MS;
  });
}
