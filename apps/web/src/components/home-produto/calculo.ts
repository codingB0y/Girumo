/** Contas da calculadora "Quanto tempo a loja gasta postando na mão?" da /page2. */

export interface Rotina {
  grupos: number;
  posts: number;
  /** Minutos pra postar em cada grupo, por post. */
  minutos: number;
  dias: number;
}

export type Limite = readonly [min: number, max: number];

export function minutosNaMao({ grupos, posts, minutos, dias }: Rotina): number {
  return grupos * posts * minutos * dias;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** "4 horas e 40 minutos"; abaixo de uma hora, só os minutos. */
export function tempoPorExtenso(minutos: number): string {
  if (minutos < 60) return plural(minutos, "minuto", "minutos");
  const horas = plural(Math.floor(minutos / 60), "hora", "horas");
  const resto = minutos % 60;
  return resto === 0 ? horas : `${horas} e ${plural(resto, "minuto", "minutos")}`;
}

/** Preço do mês dividido por 30 dias: "R$ 9,90", com espaço inseparável como em reais(). */
export function custoPorDia(precoMensal: number): string {
  return `R$ ${(precoMensal / 30).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Valor da hora acima do qual o plano sai mais barato que postar na mão. */
export function horaQueFechaConta(precoMensal: number, minutosNoMes: number): number {
  return Math.ceil(precoMensal / (minutosNoMes / 60));
}

/** Soma o passo do + ou − sem sair do limite. */
export function ajustar(valor: number, passo: number, [min, max]: Limite): number {
  return Math.min(max, Math.max(min, valor + passo));
}
