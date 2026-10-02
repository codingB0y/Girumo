import { dayBR, dayBROf, diaMesBR, monthBR } from "@/lib/date-br";
import {
  barrasDaAtividade,
  diaDaSemanaPassada,
  meiaNoiteBR,
  semanaPassadaMedida,
  somaDa,
  somaMedida,
  type AtividadeDaCampanha,
  type Barra,
} from "@/lib/painel/atividade";
import { revenueInMonth, type MonthlyOrder } from "@/lib/painel-metrics";

/**
 * A faixa de status da Início "Ao vivo" (spec 2026-10-02): a loja inteira hoje.
 * Mesmas contas da faixa da campanha (`visao-geral.tsx`), sobre a série da loja.
 */

export type Comparacao =
  | { tipo: "contra"; antes: number; diaPassado: string }
  | { tipo: "medindo"; desde: string };

export type NumerosDaFaixa = {
  entraram: number;
  sairam: number;
  saldo: number;
  /** Saldo dos últimos 7 dias, só do que foi medido. */
  saldoSemana: number;
  cliques: number;
  seteDias: Barra[];
  comparacao: Comparacao;
};

export type PedidosDeHoje = { quantidade: number; valor: number; metaPct: number | null };

const MIN_MS = 60_000;
const DIA_MS = 86_400_000;

export function numerosDaFaixa(a: AtividadeDaCampanha): NumerosDaFaixa {
  const hoje = somaMedida(barrasDaAtividade(a, "hoje", "entraram", "sairam"));
  const semana = somaMedida(barrasDaAtividade(a, "7d", "entraram", "sairam"));
  return {
    entraram: hoje.entraram,
    sairam: hoje.sairam,
    saldo: hoje.entraram - hoje.sairam,
    saldoSemana: semana.entraram - semana.sairam,
    cliques: somaDa(a.porHora, "cliques"),
    seteDias: barrasDaAtividade(a, "7d", "entraram"),
    comparacao: semanaPassadaMedida(a)
      ? { tipo: "contra", antes: a.semanaPassada.entraram, diaPassado: diaDaSemanaPassada(dayBR(new Date(a.geradoEm)), true) }
      : { tipo: "medindo", desde: a.entradasDesde },
  };
}

export function pedidosDeHoje(orders: readonly MonthlyOrder[], metaDoMes: number | null, agora: Date): PedidosDeHoje {
  const hoje = dayBR(agora);
  const deHoje = orders.filter((o) => dayBROf(o.created_at) === hoje);
  const doMes = revenueInMonth(orders, monthBR(agora));
  return {
    quantidade: deHoje.length,
    valor: deHoje.reduce((s, o) => s + (o.value ?? 0), 0),
    metaPct: metaDoMes && metaDoMes > 0 ? Math.round((doMes / metaDoMes) * 100) : null,
  };
}

export function atualizadoHa(geradoEm: string, agora: Date): string {
  const minutos = Math.floor((agora.getTime() - Date.parse(geradoEm)) / MIN_MS);
  if (minutos < 1) return "atualizado agora";
  if (minutos < 60) return `atualizado há ${minutos} min`;
  return `atualizado há ${Math.floor(minutos / 60)} h`;
}

/**
 * `DD/MM` do primeiro dia em que a comparação com a semana passada vale: o dia D
 * cuja meia-noite, menos 7 dias, já é depois do início da medição
 * (a mesma conta de `semanaPassadaMedida`).
 */
export function comparacaoComecaEm(entradasDesde: string): string {
  const desde = Date.parse(entradasDesde);
  const meiaNoite = meiaNoiteBR(dayBR(new Date(desde))).getTime();
  // Medição que começou no meio do dia: o primeiro dia inteiro medido é o seguinte.
  const primeiroDiaInteiro = meiaNoite < desde ? meiaNoite + DIA_MS : meiaNoite;
  return diaMesBR(new Date(primeiroDiaInteiro + 7 * DIA_MS).toISOString()) ?? "";
}
