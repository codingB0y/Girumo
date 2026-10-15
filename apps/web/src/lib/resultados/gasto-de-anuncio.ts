// apps/web/src/lib/resultados/gasto-de-anuncio.ts
import { parseValorDoPedido } from "@/lib/orders/valor-do-pedido";
import { contagem, custo, diaMes, duasCasas, type InicioDeGasto } from "@/lib/resultados/anuncios-tela";
import { dataValida, diasEntre, type Periodo } from "@/lib/resultados/periodo-anuncios";
import type { LinhaRelatorio } from "@/lib/resultados/relatorio-anuncios";

/**
 * Gasto de anúncio lançado à mão (spec 2026-10-10-funil-anuncios §3–§4). Puro:
 * a tela e as rotas usam as mesmas regras, e os limites são os do `check` de
 * `public.ad_spend` (migração 20261010130000_funil_anuncios_tabelas.sql).
 */

/** `ad_spend_campanha_tamanho`: char_length(utm_campaign) between 1 and 200. */
export const MAX_CAMPANHA = 200;
/** `ad_spend_valor`: amount > 0 and amount <= 10000000. */
export const MAX_VALOR = 10_000_000;

export type LancamentoDeGasto = {
  id: string;
  utm_campaign: string;
  starts_on: string;
  ends_on: string;
  amount: number;
};
export type CorpoDoGasto = Omit<LancamentoDeGasto, "id">;
export type RespostaDoGasto = { lancamentos: LancamentoDeGasto[]; campanhas: string[] };
export type FormularioDeGasto = { campanha: string; valor: string; de: string; ate: string };
export type FormularioLido = { ok: true; corpo: CorpoDoGasto } | { ok: false; erro: string };
/** Só o que a lista de campanhas lê: vale para `RelatorioAnuncios` e para `RelatorioParaTela` (saída de `semGasto`). */
export type LinhaComCampanha = Pick<LinhaRelatorio, "nivel" | "campanha">;

/** Tira só espaço ASCII das pontas, como o `btrim` do relatório (JS `trim()` tiraria também NBSP, tab e quebra de linha). */
export function aparar(s: string): string {
  return s.replace(/^ +| +$/g, "");
}

// `amount` é numeric(12, 2): o banco arredonda para centavos, e a validação olha o que vai ser gravado (`duasCasas`).
const SO_MILHAR = /^[1-9]\d{0,2}(\.\d{3})+$/;
const DUAS_CASAS = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;

/**
 * O "Valor usado" como o lojista digita. Reaproveita o parser dos pedidos, com uma
 * exceção: "1.620" (só grupos de milhar, sem vírgula) é mil seiscentos e vinte —
 * o Gerenciador mostra "R$1.620,00", e quem copia sem os centavos não quer R$ 1,62.
 * Fora do `check` da tabela (zero, negativo, mais de 10 milhões): `null`.
 */
export function valorDigitado(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  const bruto = SO_MILHAR.test(limpo) ? Number(limpo.replace(/\./g, "")) : parseValorDoPedido(limpo);
  if (!Number.isFinite(bruto)) return null;
  const valor = duasCasas(bruto);
  return valor > 0 && valor <= MAX_VALOR ? valor : null;
}

/** O formulário do diálogo vira o corpo de POST/PATCH, ou o motivo de não virar. */
export function lerFormulario(form: FormularioDeGasto): FormularioLido {
  // Aparada: o relatório compara com `btrim(utm_campaign)`; espaço sobrando
  // viraria uma segunda linha de campanha, só com gasto.
  const campanha = aparar(form.campanha);
  if (!campanha || campanha.length > MAX_CAMPANHA) return { ok: false, erro: "Escolha a campanha." };
  const valor = valorDigitado(form.valor);
  if (valor === null) return { ok: false, erro: "Valor inválido: use o formato 1.620,00 (até R$ 10.000.000)." };
  if (!dataValida(form.de) || !dataValida(form.ate)) return { ok: false, erro: "Escolha as datas de início e fim." };
  if (diasEntre(form.de, form.ate) < 0) return { ok: false, erro: "A data final vem antes da inicial." };
  return { ok: true, corpo: { utm_campaign: campanha, amount: valor, starts_on: form.de, ends_on: form.ate } };
}

/** Lançamento novo: as datas do período que a aba mostra; a campanha começa vazia (o lojista escolhe). */
export function formularioNovo(periodo: Periodo): FormularioDeGasto {
  return { campanha: "", valor: "", de: periodo.de, ate: periodo.ate };
}

/** Editar: o valor volta em "1.620,50", que `valorDigitado` lê de novo igual. */
export function formularioDe(l: LancamentoDeGasto): FormularioDeGasto {
  return {
    campanha: l.utm_campaign,
    valor: l.amount.toLocaleString("pt-BR", DUAS_CASAS),
    de: l.starts_on,
    ate: l.ends_on,
  };
}

/**
 * Os nomes que o diálogo oferece (spec §4: "lista dos utm_campaign já recebidos"):
 * as linhas de nível campanha do relatório, sem a "(sem UTM)" (nula), mais os nomes
 * que já têm lançamento — editar um lançamento de campanha que parou de chegar não
 * pode trocar o nome sem o lojista ver. Sem repetir, em ordem alfabética.
 */
export function campanhasDisponiveis(
  linhas: readonly LinhaComCampanha[],
  lancamentos: readonly LancamentoDeGasto[],
): string[] {
  const nomes = new Set<string>();
  for (const l of linhas) {
    if (l.nivel === "campanha" && l.campanha !== null && l.campanha.length <= MAX_CAMPANHA) nomes.add(l.campanha);
  }
  for (const l of lancamentos) nomes.add(l.utm_campaign);
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** "11/09 a 10/10"; um dia só: "11/09". */
export function periodoDoLancamento(l: LancamentoDeGasto): string {
  return l.starts_on === l.ends_on ? diaMes(l.starts_on) : `${diaMes(l.starts_on)} a ${diaMes(l.ends_on)}`;
}

/** A anotação do gráfico por dia (PR 5b, `marcasDeGasto`) marca o dia em que cada lançamento começa. */
export function iniciosDosLancamentos(lancamentos: readonly LancamentoDeGasto[]): InicioDeGasto[] {
  return lancamentos.map((l) => ({ dia: l.starts_on, campanha: l.utm_campaign }));
}

/** Rodapé do cartão "Gasto lançado" (mockup Main: "3 lançamentos · lançar"). */
export function textoDoRodape(quantos: number): string {
  return quantos === 0 ? "nenhum lançamento" : contagem(quantos, "lançamento", "lançamentos");
}

/** Mostra o valor lido ao lado do campo: "= R$ 1.620,00". */
export function valorLido(texto: string): string | null {
  const valor = valorDigitado(texto);
  return valor === null ? null : `= ${custo(valor)}`;
}

export type OperacaoDeGasto = { tipo: "criar" } | { tipo: "editar"; id: string } | { tipo: "excluir"; id: string };
export type PedidoDeGasto = { url: string; method: "POST" | "PATCH" | "DELETE"; body?: string };

const ROTA_DO_GASTO = "/api/anuncios/gasto";

/** A requisição de cada operação do diálogo (`corpo` só vale para criar e editar). */
export function pedidoDoGasto(op: OperacaoDeGasto, corpo?: CorpoDoGasto): PedidoDeGasto {
  if (op.tipo === "criar") return { url: ROTA_DO_GASTO, method: "POST", body: JSON.stringify(corpo) };
  const url = `${ROTA_DO_GASTO}/${op.id}`;
  return op.tipo === "editar" ? { url, method: "PATCH", body: JSON.stringify(corpo) } : { url, method: "DELETE" };
}

const MAX_MENSAGEM = 200;
const PARECE_HTML = /<\/?[a-z!]/i;

function mensagemCurta(texto: string): string | null {
  const t = texto.trim();
  return t && t.length <= MAX_MENSAGEM && !PARECE_HTML.test(t) ? t : null;
}

/**
 * O que mostrar quando a resposta não foi ok. Nossas rotas mandam `{ error }`; o 403 do
 * `assertPermission` da rota e o do guard de módulo são texto puro. Corpo comprido ou
 * HTML (página de erro da hospedagem) nunca vai para a tela: cai na mensagem da operação.
 */
export function mensagemDeFalha(op: OperacaoDeGasto, json: unknown, texto: string): string {
  const doJson = (json as { error?: unknown } | null)?.error;
  if (typeof doJson === "string") {
    const m = mensagemCurta(doJson);
    if (m) return m;
  }
  return mensagemCurta(texto) ?? (op.tipo === "excluir" ? "Não deu para excluir o gasto." : "Não deu para salvar o gasto.");
}

function ehLancamento(x: unknown): x is LancamentoDeGasto {
  if (typeof x !== "object" || x === null) return false;
  const l = x as Record<string, unknown>;
  return (
    typeof l.id === "string" &&
    typeof l.utm_campaign === "string" &&
    typeof l.starts_on === "string" &&
    typeof l.ends_on === "string" &&
    typeof l.amount === "number"
  );
}

/** Guarda leve do corpo de `GET /api/anuncios/gasto` no cliente: o que não é a resposta vira erro, nunca lista vazia. */
export function ehRespostaDoGasto(corpo: unknown): corpo is RespostaDoGasto {
  if (typeof corpo !== "object" || corpo === null) return false;
  const c = corpo as Record<string, unknown>;
  return (
    Array.isArray(c.lancamentos) &&
    c.lancamentos.every(ehLancamento) &&
    Array.isArray(c.campanhas) &&
    c.campanhas.every((n) => typeof n === "string")
  );
}
