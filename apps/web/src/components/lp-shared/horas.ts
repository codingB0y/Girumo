/**
 * A conta da calculadora "quanto tempo você perde postando na mão":
 * grupos × minutos por grupo × posts por dia, e o mês com 30 dias.
 *
 * Os campos vêm de input que a pessoa digita — vazio, negativo ou lixo vira 0,
 * para a tela nunca mostrar tempo negativo nem "NaN horas".
 */

export const DIAS_NO_MES = 30;
const MINUTOS_POR_HORA = 60;

export interface TempoNaMao {
  minutosPorDia: number;
  horasPorDia: number;
  horasPorMes: number;
}

function naoNegativo(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

export function horasNaMao(grupos: number, minutos: number, posts: number): TempoNaMao {
  // O produto também passa pelo filtro: entradas finitas enormes estouram em Infinity.
  const minutosPorDia = naoNegativo(naoNegativo(grupos) * naoNegativo(minutos) * naoNegativo(posts));
  return {
    minutosPorDia,
    horasPorDia: minutosPorDia / MINUTOS_POR_HORA,
    horasPorMes: (minutosPorDia * DIAS_NO_MES) / MINUTOS_POR_HORA,
  };
}

const UMA_CASA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/**
 * "45 minutos", "1 hora", "1,5 hora", "2 horas", "1.200 horas".
 *
 * Singular abaixo de 2, como se fala ("1,5 hora"). O plural sai do valor JÁ
 * arredondado, senão 1,9998 viraria "2 hora"; pelo mesmo motivo os minutos são
 * arredondados antes de decidir entre minutos e horas (59,6 → "1 hora", não "60 minutos").
 */
export function formatHoras(horas: number): string {
  const minutos = Math.round(naoNegativo(horas) * MINUTOS_POR_HORA);
  if (minutos < MINUTOS_POR_HORA) return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const arredondadas = Math.round(naoNegativo(horas) * 10) / 10;
  return `${UMA_CASA.format(arredondadas)} ${arredondadas < 2 ? "hora" : "horas"}`;
}
