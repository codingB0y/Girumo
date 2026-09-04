/** 10/min é o teto de veterano; 6 s por mensagem é a promessa que não mente para cima. */
const SEGUNDOS_POR_MENSAGEM = 6;

export function etaDisparo(view: { sent: number; total: number }): string | null {
  const restantes = Math.max(0, view.total - view.sent);
  if (restantes === 0) return null;
  const minutos = Math.max(1, Math.ceil((restantes * SEGUNDOS_POR_MENSAGEM) / 60));
  return `≈ ${minutos} min`;
}
