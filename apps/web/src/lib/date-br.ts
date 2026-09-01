/**
 * Datas do painel no fuso do lojista, não no do servidor.
 *
 * O painel calculava "hoje" e "este mês" com `toISOString()`, que é UTC. Como
 * Brasília é UTC-3, às 21h o dia já tinha virado: "3 contatos hoje" caía para
 * "0" com movimento acontecendo, e no dia 31 às 21h o faturamento do mês
 * inteiro sumia da tela. O erro tem dois lados e os dois precisam do mesmo
 * fuso — gerar a chave ("que dia é hoje?") e ler o evento ("de que dia é este
 * lead?"). Corrigir só a geração deixaria a comparação errada.
 *
 * O Brasil não usa horário de verão desde 2019, então o deslocamento é fixo;
 * ainda assim o cálculo passa pelo `Intl`, que é quem sabe disso — e continuará
 * sabendo se a regra mudar.
 */

const TZ = "America/Sao_Paulo";

/** `en-CA` é o locale que formata data como `YYYY-MM-DD`. */
const DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});

const UM_DIA_MS = 86_400_000;

/** `YYYY-MM-DD` do instante, no fuso de Brasília. */
export function dayBR(d: Date = new Date()): string {
  return DIA.format(d);
}

/** `YYYY-MM` do instante, no fuso de Brasília. */
export function monthBR(d: Date = new Date()): string {
  return dayBR(d).slice(0, 7);
}

/**
 * `YYYY-MM-DD` de N dias atrás, em Brasília.
 *
 * Subtrai milissegundos em vez de usar `setDate`, que trabalharia no fuso do
 * navegador — e o navegador do lojista não é necessariamente o de Brasília.
 */
export function dayBRAgo(daysAgo: number, now: Date = new Date()): string {
  return dayBR(new Date(now.getTime() - daysAgo * UM_DIA_MS));
}

/**
 * Dia de Brasília em que um timestamp do banco aconteceu.
 *
 * `undefined` quando não há data ou ela não parseia — quem chama decide o que
 * fazer com isso, ninguém entra num recorte por engano.
 */
export function dayBROf(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  // Data pura já É o dia. Passar por `new Date` a leria como meia-noite UTC,
  // que em SP é o dia anterior — a data andaria um dia para trás.
  if (SO_DATA.test(iso)) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : dayBR(d);
}

/**
 * `HH:MM` de Brasília de um timestamp do banco.
 *
 * String vazia quando não há data ou ela não parseia — quem chama omite o
 * trecho em vez de imprimir "às Invalid Date".
 */
export function horaBR(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : HORA.format(d);
}

/** Mês de Brasília em que um timestamp do banco aconteceu. */
export function monthBROf(iso?: string | null): string | undefined {
  return dayBROf(iso)?.slice(0, 7);
}
