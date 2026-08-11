export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function getDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function getMonthStr(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}
