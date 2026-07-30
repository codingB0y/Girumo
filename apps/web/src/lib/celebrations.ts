/**
 * Cartão compartilhável (P2.17) — cálculo puro dos marcos de celebração.
 *
 * Sem I/O, sem server-only → testável e usado no cliente (dashboard) pra decidir
 * o que celebrar. O dedupe (1× por marco) é do servidor via `celebrations`; aqui
 * só computamos os marcos ATINGIDOS a partir dos dados que o dashboard já tem.
 *
 * `marker_key` é a chave de dedupe. Marcos: grupo lotou, meta do mês batida, e o
 * MAIOR marco de pedidos atingido (não enfileira 10/50/100 de uma vez pra quem já
 * está alto — só o topo; ao crescer pro próximo, uma nova chave celebra).
 */

export type CelebrationSignals = {
  /** Grupos já determinados "cheios" pelo cliente (tem a lógica de capacidade). */
  fullGroups: { id: string; name: string; members: number }[];
  monthlyGoal: number | null;
  /** Contatos do período usado pra meta. */
  contacts: number;
  ordersCount: number;
};

export type Celebration = {
  key: string;
  title: string;
  stat: number;
  label: string;
};

export const ORDER_MILESTONES = [10, 50, 100, 250, 500] as const;

export function computeCelebrations(s: CelebrationSignals): Celebration[] {
  const out: Celebration[] = [];

  for (const g of s.fullGroups) {
    out.push({
      key: `group_full:${g.id}`,
      title: `Grupo "${g.name}" lotou! 🎉`,
      stat: g.members,
      label: `revendedores em ${g.name}`,
    });
  }

  if (s.monthlyGoal && s.monthlyGoal > 0 && s.contacts >= s.monthlyGoal) {
    out.push({ key: "goal_hit", title: "Meta do mês batida! 🎉", stat: s.contacts, label: "contatos captados" });
  }

  const achieved = ORDER_MILESTONES.filter((m) => s.ordersCount >= m);
  const top = achieved[achieved.length - 1];
  if (top) {
    out.push({ key: `orders_${top}`, title: `${top} pedidos registrados! 🎉`, stat: top, label: "pedidos" });
  }

  return out;
}

/** Filtra os que ainda não foram celebrados (dedupe pelo conjunto do servidor). */
export function pendingCelebrations(all: Celebration[], celebratedKeys: Set<string>): Celebration[] {
  return all.filter((c) => !celebratedKeys.has(c.key));
}
