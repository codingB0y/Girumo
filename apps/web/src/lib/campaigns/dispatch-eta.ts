/**
 * O ritmo do fan-out é decidido no banco (app.record_send, 20261105140000): fora de
 * lote, 3 a 7 s entre mensagens; num post para LOTE_LENTO grupos ou mais, 20 a 60 s —
 * o ritmo de um admin postando grupo a grupo. A promessa arredonda para cima (6 s e
 * 45 s por mensagem), nunca para baixo: ETA otimista é o que faz o lojista achar que
 * o envio travou.
 */
export const LOTE_LENTO = 10;
export const SEGUNDOS_POR_MENSAGEM = 6;
export const SEGUNDOS_POR_MENSAGEM_EM_LOTE = 45;

/** Segundos por mensagem que a tela promete para um post de `total` mensagens. */
export function segundosPorMensagem(total: number): number {
  return total >= LOTE_LENTO ? SEGUNDOS_POR_MENSAGEM_EM_LOTE : SEGUNDOS_POR_MENSAGEM;
}

export function etaDisparo(view: { sent: number; total: number }): string | null {
  const restantes = Math.max(0, view.total - view.sent);
  if (restantes === 0) return null;
  const minutos = Math.max(1, Math.ceil((restantes * segundosPorMensagem(view.total)) / 60));
  return `≈ ${minutos} min`;
}
