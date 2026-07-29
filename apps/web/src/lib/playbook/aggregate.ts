/**
 * Playbook — núcleo puro de agregação (sem I/O, sem server-only), testável.
 *
 * `computePlaybook` recebe sinais simples (já lidos dos stores pela rota) e
 * devolve o estado de cada passo + progresso + próximo passo. A regra
 * `done = live || persistido` é o que garante "sem regressão": uma vez que um
 * passo automático foi detectado (e persistido pela rota via write-through), ele
 * fica marcado mesmo que a condição ao vivo mude (ex.: WhatsApp desconecta).
 */

import { PLAYBOOK_STEPS, PLAYBOOK_TOTAL, type PlaybookStepKey } from "./steps";

export type PlaybookSignals = {
  isConnected: boolean;
  campaignCount: number;
  broadcastCount: number;
  hasWelcomeAutomation: boolean;
  leadCount: number;
  orderCount: number;
  hasGoal: boolean;
  /** step_key → done_at (ISO) já persistido em playbook_progress. */
  persistedDoneAt: Partial<Record<PlaybookStepKey, string>>;
};

export type PlaybookStepState = {
  key: PlaybookStepKey;
  title: string;
  description: string;
  auto: boolean;
  done: boolean;
  doneAt: string | null;
  ctaHref: string;
  ctaLabel: string;
};

export type PlaybookState = {
  steps: PlaybookStepState[];
  completed: number;
  total: number;
  nextStepKey: PlaybookStepKey | null;
  graduated: boolean;
};

/** Condição ao vivo de cada passo (share_link é manual → nunca live). */
export function liveStepSignals(s: PlaybookSignals): Record<PlaybookStepKey, boolean> {
  return {
    connect: s.isConnected,
    first_campaign: s.campaignCount > 0,
    share_link: false,
    first_broadcast: s.broadcastCount > 0,
    welcome_automation: s.hasWelcomeAutomation,
    leads_50: s.leadCount >= 50,
    first_order: s.orderCount >= 1,
    monthly_goal: s.hasGoal,
  };
}

export function computePlaybook(s: PlaybookSignals): PlaybookState {
  const live = liveStepSignals(s);

  const steps: PlaybookStepState[] = PLAYBOOK_STEPS.map((def) => {
    const persisted = s.persistedDoneAt[def.key] ?? null;
    const done = live[def.key] || persisted != null;
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      auto: def.auto,
      done,
      doneAt: persisted,
      ctaHref: def.ctaHref,
      ctaLabel: def.ctaLabel,
    };
  });

  const completed = steps.filter((x) => x.done).length;
  const nextStepKey = steps.find((x) => !x.done)?.key ?? null;

  return {
    steps,
    completed,
    total: PLAYBOOK_TOTAL,
    nextStepKey,
    graduated: completed === PLAYBOOK_TOTAL,
  };
}
