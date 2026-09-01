/**
 * Recortes mensais usados na tela inicial do painel.
 *
 * Vive fora do componente por causa de uma decisão que não é óbvia: pedido sem
 * `created_at` fica de fora do recorte do mês em vez de entrar por padrão —
 * melhor um faturamento conservador do que um número inflado que o lojista não
 * consegue conferir contra os pedidos que ele vê listados.
 *
 * O mês é o de Brasília, não o do servidor: um pedido fechado às 22h do dia 31
 * chega ao banco com carimbo UTC do dia 1º, e comparar o prefixo cru jogava
 * esse pedido para o mês seguinte.
 */

import { monthBR, monthBROf } from "./date-br";

export type MonthlyOrder = {
  value?: number;
  created_at?: string;
};

/** Mês corrente no formato `YYYY-MM`, no fuso de Brasília. */
export function currentMonth(now: Date = new Date()): string {
  return monthBR(now);
}

export function ordersInMonth<T extends MonthlyOrder>(orders: readonly T[], month: string): T[] {
  return orders.filter((o) => monthBROf(o.created_at) === month);
}

export function revenueInMonth(orders: readonly MonthlyOrder[], month: string): number {
  return ordersInMonth(orders, month).reduce((total, o) => total + (o.value ?? 0), 0);
}
