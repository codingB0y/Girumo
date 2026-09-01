/**
 * Linha do tempo do tenant, montada a partir do que já existe.
 *
 * Não há tabela de eventos e não deve haver: `leads`, `orders` e `disparos` já
 * guardam quando cada coisa aconteceu, e uma quarta tabela só criaria uma
 * segunda verdade pra manter em dia. O preço é que o feed só sabe o que essas
 * três sabem — o que é honesto, e é o que o lojista consegue conferir clicando.
 *
 * O disparo vem de `/api/disparos`, não de `schedules`. A versão anterior
 * filtrava `schedule.status === "sent"`, valor que não existe no enum de
 * agendamento (`pending | running | done | failed`) — o ramo descartava todos
 * os agendamentos, e a seção "Atividade" nunca mostrou um disparo sequer.
 */

export type ActivitySources = {
  leads: readonly { id: string; name?: string; sourceGroup?: string; enteredAt?: string }[];
  orders: readonly { id: string; value?: number; created_at?: string }[];
  disparos: readonly {
    id: string;
    status: string;
    sent?: number;
    dispatchedAt?: string;
  }[];
};

export type ActivityItem =
  | { id: string; kind: "lead"; at: string; name: string; group?: string }
  | { id: string; kind: "order"; at: string; value: number }
  | { id: string; kind: "broadcast"; at: string; grupos: number };

function isRealDate(iso: string | undefined): iso is string {
  return !!iso && Number.isFinite(new Date(iso).getTime());
}

/**
 * As `limit` ocorrências mais recentes, das três fontes juntas.
 *
 * O `id` leva o prefixo do tipo porque um lead e um pedido podem ter o mesmo
 * UUID de origens diferentes, e a lista precisa de chave estável.
 */
export function buildActivityFeed(sources: ActivitySources, limit: number): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const lead of sources.leads) {
    if (!isRealDate(lead.enteredAt)) continue;
    items.push({
      id: `lead-${lead.id}`,
      kind: "lead",
      at: lead.enteredAt,
      // Participante `@lid` sem telefone entra sem nome — "Novo contato" é
      // melhor do que uma linha começando com espaço em branco.
      name: lead.name?.trim() || "Novo contato",
      ...(lead.sourceGroup ? { group: lead.sourceGroup } : {}),
    });
  }

  for (const order of sources.orders) {
    if (!isRealDate(order.created_at)) continue;
    items.push({
      id: `order-${order.id}`,
      kind: "order",
      at: order.created_at,
      value: order.value ?? 0,
    });
  }

  for (const disparo of sources.disparos) {
    // Só o que já saiu. Agendado é futuro (vive no card "Próximos disparos") e
    // falhado não é atividade da loja, é problema de operação. `dispatchedAt`
    // nulo é disparo que nunca rodou.
    if (disparo.status !== "sent" || !isRealDate(disparo.dispatchedAt)) continue;
    items.push({
      id: `broadcast-${disparo.id}`,
      kind: "broadcast",
      at: disparo.dispatchedAt,
      grupos: disparo.sent ?? 0,
    });
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Quanto tempo faz, em português de gente.
 *
 * Mais verboso de propósito que o `timeAgo` do sininho de notificações ("5min",
 * "3h"): ali o espaço é de dropdown e a lista é de alertas; aqui é uma linha do
 * tempo que se lê como frase.
 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  // Data no futuro (relógio do servidor adiantado) vira "agora" em vez de
  // "há -3 min".
  const diff = Math.max(0, now.getTime() - then);
  if (diff < MINUTE_MS) return "agora";
  if (diff < HOUR_MS) return `há ${Math.floor(diff / MINUTE_MS)} min`;
  if (diff < DAY_MS) return `há ${Math.floor(diff / HOUR_MS)} h`;

  const days = Math.floor(diff / DAY_MS);
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}
