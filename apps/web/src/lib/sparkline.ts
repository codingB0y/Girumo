/**
 * Série diária e geometria para os sparklines dos KPIs do painel.
 *
 * A escala sempre começa em zero. Normalizar entre o mínimo e o máximo da
 * janela faria uma oscilação de 3 para 4 contatos parecer uma montanha — o
 * gráfico é pequeno demais pra carregar um eixo que explique isso.
 */

export type DatedValue = {
  /** ISO 8601, ou qualquer string que comece com `YYYY-MM-DD`. */
  date?: string;
  value?: number;
};

/** `YYYY-MM-DD` de N dias atrás. */
export function dayKey(daysAgo: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Soma os valores por dia numa janela que termina hoje.
 *
 * Devolve sempre `days` posições, da mais antiga para hoje, com zero nos dias
 * sem movimento — um dia parado é informação, não é buraco. Itens sem data ou
 * fora da janela ficam de fora.
 */
export function dailySeries(
  items: readonly DatedValue[],
  days: number,
  now: Date = new Date(),
): number[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) buckets.set(dayKey(i, now), 0);

  for (const item of items) {
    const key = item.date?.slice(0, 10);
    if (!key || !buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + (item.value ?? 0));
  }

  return [...buckets.values()];
}

/**
 * Pontos de uma polyline, da esquerda para a direita, com a escala fixada em
 * zero. Série vazia devolve string vazia — quem chama não desenha nada.
 */
export function sparklinePoints(values: readonly number[], width: number, height: number): string {
  if (values.length === 0) return "";

  const max = Math.max(...values, 0);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  return values
    .map((v, i) => {
      const x = values.length > 1 ? i * stepX : width / 2;
      // max 0 (nenhum movimento na janela) desenha a linha na base.
      const y = max > 0 ? height - (v / max) * height : height;
      return `${round(x)},${round(y)}`;
    })
    .join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
