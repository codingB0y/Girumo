/**
 * O mês das vendas no fuso de Brasília: venda das 22h do dia 31 é do mês que
 * acaba, não do que já começou em Greenwich. UTC−3 fixo — o Brasil não tem
 * horário de verão desde 2019. Puro: a tela pode usar a mesma regra.
 */
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "YYYY-MM" aceito em `?mes=`. Só anos 20xx: `Date.UTC` lê 0–99 como 1900 em diante. */
export const MONTH_FORMAT = /^20\d{2}-(0[1-9]|1[0-2])$/;

/** O mês ("YYYY-MM") em que o instante cai, em Brasília. */
export function brasiliaMonth(now: Date): string {
  return new Date(now.getTime() - BRASILIA_OFFSET_MS).toISOString().slice(0, 7);
}

/** Início (inclusivo) e fim (exclusivo) do mês de Brasília, em ISO UTC. Recebe um mês já validado. */
export function monthRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1) + BRASILIA_OFFSET_MS).toISOString(),
    end: new Date(Date.UTC(year, monthNumber, 1) + BRASILIA_OFFSET_MS).toISOString(),
  };
}
