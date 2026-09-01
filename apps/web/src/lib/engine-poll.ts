/**
 * Ritmo de consulta ao status da engine na tela de conexão.
 *
 * A tela pergunta "já conectou?" em loop enquanto o lojista escaneia o QR.
 * O intervalo precisa ser curto o bastante pra reagir ao scan, mas não pode
 * virar uma enxurrada quando a engine está fora do ar — antes eram 4 em 4
 * segundos, para sempre, inclusive já conectado e com a aba em segundo plano.
 */

/** Intervalo normal entre consultas, com a engine respondendo. */
export const POLL_MS = 4_000;

/** Teto do backoff — mesmo com a engine morta, tentamos de meio em meio minuto. */
export const POLL_MAX_MS = 30_000;

/**
 * Cadência de vigilância depois que a sessão abre.
 *
 * Conectar não é o fim da história: a sessão cai sozinha (celular sem internet,
 * 4 aparelhos vinculados, os 14 dias de inatividade). Antes o polling dava
 * `return` ao ver `connected` e nunca mais perguntava, então a tela seguia
 * mostrando "conectado" com o número fora do ar até alguém dar F5.
 */
export const WATCH_MS = 30_000;

/**
 * Próximo intervalo: volta ao normal a cada sucesso, dobra a cada falha até o
 * teto.
 */
export function nextPollDelay(current: number, outcome: "ok" | "error"): number {
  if (outcome === "ok") return POLL_MS;
  return Math.min(Math.max(current, POLL_MS) * 2, POLL_MAX_MS);
}
