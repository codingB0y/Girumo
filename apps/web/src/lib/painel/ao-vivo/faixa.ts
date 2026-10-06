import { dayBR, dayBROf, monthBR } from "@/lib/date-br";
import { clicksByCampaign, type AttributableCampaign, type AttributableLink } from "@/lib/links/click-attribution";
import {
  barrasDaAtividade,
  diaDaSemanaPassada,
  diaPorExtenso,
  nomeDoMes,
  semanaPassadaMedida,
  somaDa,
  somaMedida,
  variacao,
  type AtividadeDaCampanha,
  type Barra,
  type Movimento,
} from "@/lib/painel/atividade";
import { medindoDesde } from "@/lib/painel/atividade-texto";
import { numero } from "@/lib/painel/grupos";
import { revenueInMonth, type MonthlyOrder } from "@/lib/painel-metrics";

/**
 * A faixa de status da Início "Ao vivo" (spec 2026-10-02; G2 em 2026-10-05, decisão 6): a loja
 * inteira hoje. Mesmas contas da faixa da campanha (`visao-geral.tsx`), sobre a série da loja.
 * O saldo saiu da faixa: ele aparece no gráfico ("214 entraram · 23 saíram").
 */

export type Comparacao =
  | { tipo: "contra"; antes: Movimento; diaPassado: string }
  | { tipo: "medindo"; desde: string };

export type NumerosDaFaixa = {
  entraram: number;
  sairam: number;
  cliques: number;
  seteDias: Barra[];
  comparacao: Comparacao;
};

export type PedidosDeHoje = { quantidade: number; valor: number; metaPct: number | null };

export type VariacaoDaFaixa = { texto: string; bom: boolean };

const MIN_MS = 60_000;
/** A legenda dos cliques nomeia no máximo três campanhas (spec G2, decisão 6). */
const CAMPANHAS_NA_LEGENDA = 3;

export function numerosDaFaixa(a: AtividadeDaCampanha): NumerosDaFaixa {
  const hoje = somaMedida(barrasDaAtividade(a, "hoje", "entraram", "sairam"));
  return {
    entraram: hoje.entraram,
    sairam: hoje.sairam,
    cliques: somaDa(a.porHora, "cliques"),
    seteDias: barrasDaAtividade(a, "7d", "entraram"),
    comparacao: semanaPassadaMedida(a)
      ? {
          tipo: "contra",
          antes: { entraram: a.semanaPassada.entraram, sairam: a.semanaPassada.sairam },
          diaPassado: diaDaSemanaPassada(dayBR(new Date(a.geradoEm)), true),
        }
      : { tipo: "medindo", desde: a.entradasDesde },
  };
}

/**
 * "+18%" ou "−15%" (o sinal de menos tipográfico) e se o movimento é bom: mais entradas é bom; nas
 * saídas (`menosEMelhor`), cair é bom. Sem base na semana passada, null: não há o que comparar.
 */
export function variacaoNaFaixa(hoje: number, antes: number, menosEMelhor = false): VariacaoDaFaixa | null {
  const delta = variacao(hoje, antes);
  if (delta === null) return null;
  const sinal = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return { texto: `${sinal}${Math.abs(delta)}%`, bom: menosEMelhor ? delta <= 0 : delta >= 0 };
}

/**
 * Legenda de Entraram ("181 na terça passada, mesma hora") e de Saíram ("27 na terça passada",
 * como no mockup G2). Antes de 7 dias medidos, "medindo desde …" nas duas.
 */
export function legendaDaComparacao(c: Comparacao, medida: keyof Movimento): string {
  if (c.tipo === "medindo") return medindoDesde(c.desde);
  const base = `${numero(c.antes[medida])} ${c.diaPassado}`;
  return medida === "entraram" ? `${base}, mesma hora` : base;
}

/**
 * Legenda de "Cliques nos links": as três campanhas com mais cliques desde sempre (o número da célula
 * é de hoje; por isso "no total"). Atribuição de `click-attribution`: o ID manda, o nome só no link
 * legado. Clique de link sem campanha conta no total e não entra na lista.
 */
export function legendaDosCliques(links: readonly AttributableLink[], campanhas: readonly AttributableCampaign[]): string {
  const total = links.reduce((s, l) => s + (l.clicks ?? 0), 0);
  if (total === 0) return "ninguém clicou num link ainda";
  const porCampanha = clicksByCampaign(links, campanhas);
  const cliquesDe = (c: AttributableCampaign) => porCampanha.get(c.id) ?? 0;
  const maiores = campanhas
    .filter((c) => cliquesDe(c) > 0)
    .sort((a, b) => cliquesDe(b) - cliquesDe(a))
    .slice(0, CAMPANHAS_NA_LEGENDA);
  if (maiores.length === 0) return `${numero(total)} no total`;
  return `no total: ${maiores.map((c) => `${c.name} ${numero(cliquesDe(c))}`).join(" · ")}`;
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

/** "6 pedidos · outubro em 63% da meta". A meta que não carregou não vira "sem meta do mês". */
export function legendaDosPedidos(p: PedidosDeHoje, agora: Date, metaOk: boolean): string {
  const quantos = p.quantidade === 0 ? "nenhum pedido hoje" : `${numero(p.quantidade)} ${p.quantidade === 1 ? "pedido" : "pedidos"}`;
  if (!metaOk) return `${quantos} · meta não carregou`;
  if (p.metaPct === null) return `${quantos} · sem meta do mês`;
  return `${quantos} · ${nomeDoMes(dayBR(agora)).toLowerCase()} em ${p.metaPct}% da meta`;
}

/** "agora", "há 3 min", "há 2 h": a idade da série. A faixa põe "atualizado" na frente a partir de 768 px. */
export function haQuanto(geradoEm: string, agora: Date): string {
  const minutos = Math.floor((agora.getTime() - Date.parse(geradoEm)) / MIN_MS);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  return `há ${Math.floor(minutos / 60)} h`;
}

/** A data do AO VIVO no fuso de Brasília: "segunda, 5 de outubro" e, no celular, "segunda 05/10". */
export function dataDaFaixa(agora: Date): { longa: string; curta: string } {
  const dia = dayBR(agora);
  const longa = diaPorExtenso(dia);
  return { longa, curta: `${longa.split(",")[0]} ${dia.slice(8)}/${dia.slice(5, 7)}` };
}
