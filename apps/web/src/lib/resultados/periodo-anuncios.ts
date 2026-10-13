import { dayBR, monthBR } from "@/lib/date-br";

/**
 * Período da aba Anúncios (spec 2026-10-10-funil-anuncios §1 e §3): datas puras
 * `YYYY-MM-DD` no relógio de Brasília. O período escolhe os CADASTROS (coorte).
 *
 * As mesmas regras que `public.attribution_report` recusa com `raise exception`
 * (de > ate, mais de 400 dias) são conferidas aqui antes, para a rota responder
 * 400 com mensagem em vez de depender do erro do banco.
 */

export const ATALHOS = ["7d", "30d", "90d", "mes"] as const;
export type AtalhoDoPeriodo = (typeof ATALHOS)[number];
export type Periodo = { de: string; ate: string };

/** O SQL recusa `p_ate - p_de > 400`. */
export const MAX_DIAS_ENTRE = 400;

const UM_DIA_MS = 86_400_000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Data pura não tem fuso: as contas usam meia-noite UTC dos dois lados. */
function emMs(dia: string): number {
  return Date.parse(`${dia}T00:00:00Z`);
}

export function somarDias(dia: string, n: number): string {
  return new Date(emMs(dia) + n * UM_DIA_MS).toISOString().slice(0, 10);
}

/** Dias de `de` até `ate` (0 quando são o mesmo dia; negativo quando `ate` vem antes). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((emMs(ate) - emMs(de)) / UM_DIA_MS);
}

/** `2026-02-30` passa no regex e não existe: a volta pelo `Date` o recusa. */
export function dataValida(dia: string): boolean {
  if (!DATA.test(dia)) return false;
  const ms = emMs(dia);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === dia;
}

/** "30 dias" = os últimos 30 dias contando hoje; "mês" = do dia 1 até hoje. */
export function periodoDoAtalho(atalho: AtalhoDoPeriodo, agora: Date): Periodo {
  const ate = dayBR(agora);
  if (atalho === "mes") return { de: `${monthBR(agora)}-01`, ate };
  const dias = atalho === "7d" ? 7 : atalho === "30d" ? 30 : 90;
  return { de: somarDias(ate, -(dias - 1)), ate };
}

export type PeriodoLido = { ok: true; periodo: Periodo } | { ok: false; erro: string };

/** `?de=&ate=` da rota. Sem os dois: últimos 30 dias. Com um só, ou inválido: erro com mensagem. */
export function periodoDaBusca(busca: URLSearchParams, agora: Date): PeriodoLido {
  const de = busca.get("de");
  const ate = busca.get("ate");
  if (de === null && ate === null) return { ok: true, periodo: periodoDoAtalho("30d", agora) };
  if (de === null || ate === null) return { ok: false, erro: "Informe as duas datas: de e ate." };
  if (!dataValida(de) || !dataValida(ate)) return { ok: false, erro: "Data inválida: use AAAA-MM-DD." };
  const dias = diasEntre(de, ate);
  if (dias < 0) return { ok: false, erro: "A data inicial vem depois da final." };
  if (dias > MAX_DIAS_ENTRE) return { ok: false, erro: "Escolha um período de até 400 dias." };
  return { ok: true, periodo: { de, ate } };
}
