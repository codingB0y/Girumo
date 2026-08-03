/**
 * Recortes mensais usados na tela inicial do painel.
 *
 * Vive fora do componente por causa de uma decisão que não é óbvia: pedido sem
 * `created_at` fica de fora do recorte do mês em vez de entrar por padrão —
 * melhor um faturamento conservador do que um número inflado que o lojista não
 * consegue conferir contra os pedidos que ele vê listados.
 */

export type MonthlyOrder = {
  value?: number;
  created_at?: string;
};

/** Mês corrente no formato `YYYY-MM`. */
export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function ordersInMonth<T extends MonthlyOrder>(orders: readonly T[], month: string): T[] {
  return orders.filter((o) => o.created_at?.startsWith(month));
}

export function revenueInMonth(orders: readonly MonthlyOrder[], month: string): number {
  return ordersInMonth(orders, month).reduce((total, o) => total + (o.value ?? 0), 0);
}
