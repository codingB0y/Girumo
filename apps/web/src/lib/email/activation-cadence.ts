/**
 * Cadência de ativação dos 30 dias — lógica PURA (sem I/O, sem server-only), pra
 * ser testável e reusada no cron.
 *
 * Marcos por idade da conta: D3, D7, D14, D21. Em vez de casar a idade EXATA (que
 * perderia o marco se o cron pulasse um dia), cada marco vale por uma JANELA até o
 * próximo. Assim uma conta com 5 dias ainda está "em D3", e uma com 9 está "em D7".
 * O dedupe (1 notificação por marco) garante 1 envio por marco mesmo com a janela.
 * Depois de 28 dias a cadência encerra (retorna null) — não fica mandando pra
 * sempre.
 */

export const ACTIVATION_MARKERS = [3, 7, 14, 21] as const;
export type ActivationMarker = (typeof ACTIVATION_MARKERS)[number];

const CADENCE_END_DAY = 28;

/** Marco vigente para uma conta com `ageDays` dias, ou null fora da cadência. */
export function activationMarkerForAge(ageDays: number): ActivationMarker | null {
  if (ageDays < 3) return null;
  if (ageDays < 7) return 3;
  if (ageDays < 14) return 7;
  if (ageDays < 21) return 14;
  if (ageDays < CADENCE_END_DAY) return 21;
  return null;
}

/** Tipo de notificação usado pro dedupe (1 por marco por tenant). */
export function activationNotificationType(marker: ActivationMarker): string {
  return `activation_d${marker}`;
}
