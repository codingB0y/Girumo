import { tetoDoEixo } from "@/lib/painel/atividade";
import { diasEntre, type AtalhoDoPeriodo } from "./periodo-anuncios";
import type { RelatorioParaTela, RespostaAnuncios } from "./relatorio-anuncios";

/**
 * Regras puras da aba Anúncios do Resultados (spec 2026-10-10-funil-anuncios §1 e §4).
 *
 * Tudo que a tela escreve ou desenha sai daqui: formatos, passagens, custos,
 * geometria do funil, eixo do gráfico. Sem React e sem o relógio do navegador
 * (quem chama passa o "hoje"), para os testes fixarem cada caso.
 */

/**
 * A venda conta pro anúncio até 90 dias depois do cadastro. CÓPIA de `janela_venda`
 * em `public.attribution_report` (migração 20261010130100_funil_anuncios_relatorio.sql),
 * que é a origem; o PR 3 tem outra (`JANELA_VENDA_MS`). Mudou lá, muda aqui e lá.
 */
export const JANELA_VENDA_DIAS = 90;

/** Configurações › Integrações › Site próprio (PR 3 da série). */
export const HREF_INTEGRACAO_DO_SITE = "/painel/configuracoes?secao=integracoes";
export const HREF_NOVA_PAGINA = "/painel/pages/nova";

export const ROTULO_DO_ATALHO: Record<AtalhoDoPeriodo, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  mes: "Este mês",
};

const DESCRICAO_DO_ATALHO: Record<AtalhoDoPeriodo, string> = {
  "7d": "nos últimos 7 dias",
  "30d": "nos últimos 30 dias",
  "90d": "nos últimos 90 dias",
  mes: "neste mês",
};

export function descricaoDoPeriodo(atalho: AtalhoDoPeriodo): string {
  return DESCRICAO_DO_ATALHO[atalho];
}

const REAIS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const CENTAVOS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const UMA_CASA = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

/** Total grande, sem centavos: "R$ 21.760". */
export function dinheiro(valor: number): string {
  return REAIS.format(valor);
}

/** Custo unitário, com centavos: "R$ 4,64". */
export function custo(valor: number): string {
  return CENTAVOS.format(valor);
}

export function inteiro(n: number): string {
  return n.toLocaleString("pt-BR");
}

/** "1 pedido", "58 pedidos". */
export function contagem(n: number, um: string, varios: string): string {
  return `${inteiro(n)} ${n === 1 ? um : varios}`;
}

/** "93%", "9,2%" (uma casa entre 0 e 10%), "0%". Sem base não existe taxa: `null`. */
export function porcentagem(parte: number, todo: number): string | null {
  if (!(todo > 0)) return null;
  const p = (parte / todo) * 100;
  return `${p > 0 && p < 10 ? p.toLocaleString("pt-BR", UMA_CASA) : Math.round(p).toLocaleString("pt-BR")}%`;
}

/**
 * "7,7×". Sem gasto lançado não existe retorno: `null` (a tela mostra travessão).
 * Gasto `null` é o relatório de quem não tem `ads:manage` (`semGasto`): também travessão.
 */
export function retorno(vendido: number, gasto: number | null): string | null {
  if (gasto === null || !(gasto > 0)) return null;
  return `${(vendido / gasto).toLocaleString("pt-BR", UMA_CASA)}×`;
}

/** Gasto dividido pelo degrau; sem gasto (zero ou escondido) ou degrau vazio: `null`. */
export function custoPor(gasto: number | null, n: number): string | null {
  return gasto !== null && gasto > 0 && n > 0 ? custo(gasto / n) : null;
}

export type CartaoDaFaixa = {
  chave: "gasto" | "vendido" | "retorno";
  rotulo: string;
  valor: string;
  detalhe: string;
  sucesso: boolean;
};

/** Quem não tem `ads:manage` recebe o gasto `null` (spec §3): o cartão diz por quê, sem link de lançar. */
const GASTO_ESCONDIDO = "só o dono e a administração veem o gasto";

/** Os três números do topo (spec §4): gasto lançado, vendido, retorno. */
export function faixaDoTotal(total: RelatorioParaTela["total"]): CartaoDaFaixa[] {
  const gasto = total.gasto;
  const temGasto = gasto !== null && gasto > 0;
  return [
    {
      chave: "gasto",
      rotulo: "Gasto lançado",
      valor: temGasto ? dinheiro(gasto) : "—",
      detalhe:
        gasto === null ? GASTO_ESCONDIDO : temGasto ? "proporcional aos dias do período" : "nenhum gasto lançado no período",
      sucesso: false,
    },
    {
      chave: "vendido",
      rotulo: "Vendido pra quem veio dos anúncios",
      valor: dinheiro(total.vendido),
      detalhe: `${contagem(total.pedidos, "pedido", "pedidos")} de ${contagem(total.compradores, "pessoa", "pessoas")}`,
      sucesso: true,
    },
    {
      chave: "retorno",
      rotulo: "Retorno",
      valor: retorno(total.vendido, total.gasto) ?? "—",
      detalhe: temGasto
        ? `${custo(total.vendido / gasto)} vendidos a cada R$ 1 de anúncio`
        : gasto === null
          ? GASTO_ESCONDIDO
          : "aparece quando houver gasto lançado",
      sucesso: false,
    },
  ];
}

/** Aviso amarelo: período cujo fim ainda está dentro da janela de venda continua vendendo. */
export function avisoDePeriodoRecente(ate: string, hoje: string): string | null {
  if (diasEntre(ate, hoje) >= JANELA_VENDA_DIAS) return null;
  return "Quem se cadastrou neste período ainda está comprando. O “Vendido” tende a crescer: a venda conta pro anúncio até 90 dias depois do cadastro.";
}

export type DegrauDoFunil = {
  chave: "cadastros" | "foram" | "entraram" | "compradores";
  rotulo: string;
  rotuloCurto: string;
  valor: number;
  /** À esquerda no computador: "93% dos cadastros". */
  passagem: string;
  /** Só a taxa, para a linha de dentro do degrau no celular. */
  taxa: string | null;
  /** À direita: "R$ 4,97", ou `null` sem gasto. */
  custo: string | null;
  unidadeDoCusto: string;
};

const DEGRAUS = [
  { chave: "cadastros", rotulo: "Se cadastraram", rotuloCurto: "cadastros", deQuem: "", unidade: "por cadastro", acima: "" },
  {
    chave: "foram",
    rotulo: "Foram pro grupo",
    rotuloCurto: "foram pro grupo",
    deQuem: "dos cadastros",
    unidade: "por clique",
    acima: "—",
  },
  {
    chave: "entraram",
    rotulo: "Entraram no grupo",
    rotuloCurto: "entraram",
    deQuem: "de quem foi",
    unidade: "por entrada",
    // Página da Girumo não mede "foi pro grupo" ainda, e convite repassado entra sem clique.
    acima: "inclui quem entrou sem passar pelo link",
  },
  {
    chave: "compradores",
    rotulo: "Compraram",
    rotuloCurto: "compraram",
    deQuem: "de quem entrou",
    unidade: "por comprador",
    // Quem já era do grupo compra pelo anúncio sem contar como entrada nova.
    acima: "inclui quem já era do grupo",
  },
] as const;

/** Os quatro degraus do funil grande, do total do relatório. */
export function degrausDoTotal(total: RelatorioParaTela["total"]): DegrauDoFunil[] {
  const valores = [total.cadastros, total.foram, total.entraram, total.compradores];
  return DEGRAUS.map((d, i) => {
    const valor = valores[i];
    const anterior = i === 0 ? null : valores[i - 1];
    const taxa = anterior === null || valor > anterior ? null : porcentagem(valor, anterior);
    const passagem =
      anterior === null ? "ponto de partida" : valor > anterior ? d.acima : taxa ? `${taxa} ${d.deQuem}` : "—";
    return {
      chave: d.chave,
      rotulo: d.rotulo,
      rotuloCurto: d.rotuloCurto,
      valor,
      passagem,
      taxa,
      custo: custoPor(total.gasto, valor),
      unidadeDoCusto: d.unidade,
    };
  });
}

export type BicoDoFunil = { valor: string; pedidos: string; esquerda: string; direita: string | null };

/** O bico verde: o vendido, o ritmo de pedidos e o retorno. */
export function bicoDoTotal(total: RelatorioParaTela["total"]): BicoDoFunil {
  const porComprador =
    total.compradores > 0 ? (total.pedidos / total.compradores).toLocaleString("pt-BR", UMA_CASA) : null;
  const pedidos = contagem(total.pedidos, "pedido", "pedidos");
  const r = retorno(total.vendido, total.gasto);
  return {
    valor: dinheiro(total.vendido),
    pedidos,
    esquerda: porComprador ? `${pedidos}, ${porComprador} por comprador` : "nenhum pedido ainda",
    direita: r ? `${r} de retorno` : null,
  };
}

export function notaDeJaMembros(n: number): string | null {
  if (n <= 0) return null;
  return `+${inteiro(n)} se cadastraram já sendo do grupo. Não contam como entrada nova; o que compraram depois do cadastro conta pro anúncio.`;
}

export type FatiaDoFunil = { largura: number; recuo: number };
export type FormaDoFunil = { piso: number; bico: number };

/** Funil grande no computador (mockup Main): degrau de 30% a 100%, bico de 28%. */
export const FUNIL_COMPUTADOR: FormaDoFunil = { piso: 30, bico: 28 };
/** Funil grande no celular (mockup Celular): texto dentro, então o degrau não afina abaixo de 48%. */
export const FUNIL_CELULAR: FormaDoFunil = { piso: 48, bico: 40 };

const duasCasas = (n: number) => Math.round(n * 100) / 100;

/**
 * Geometria de degraus que afinam (spec §4): largura `piso + (100 − piso) × n / topo`,
 * em %, e o recuo (%) de cada lado no fundo do degrau para ele fechar na largura do
 * próximo (o último fecha no `bico`).
 *
 * Um degrau nunca fica mais largo que o de cima: "entraram" pode passar de "foram"
 * (convite repassado) e o funil desenharia uma barriga. O número escrito continua o
 * real; só o desenho satura. Topo zero: todo degrau no piso.
 *
 * Serve também ao mini-funil (PR 6): a "largura" vira altura com outro piso e bico.
 */
export function geometriaDoFunil(valores: readonly number[], forma: FormaDoFunil): FatiaDoFunil[] {
  const topo = valores[0] ?? 0;
  let teto = topo;
  const larguras = valores.map((v) => {
    teto = Math.min(teto, Math.max(0, v));
    return topo > 0 ? forma.piso + ((100 - forma.piso) * teto) / topo : forma.piso;
  });
  return larguras.map((largura, i) => {
    const proxima = Math.min(largura, larguras[i + 1] ?? forma.bico);
    return { largura: duasCasas(largura), recuo: duasCasas(((largura - proxima) / (2 * largura)) * 100) };
  });
}

/** O `clip-path` que fecha o fundo do degrau no recuo. */
export function clipDoDegrau(recuo: number): string {
  return `polygon(0 0, 100% 0, ${duasCasas(100 - recuo)}% 100%, ${recuo}% 100%)`;
}

export type CartaoDeOrigem = { nome: "Instagram" | "Facebook" | "Outros"; cadastros: number; vendido: number };

/** `utm_source` do Meta (`{{site_source_name}}`): ig, fb, an, msg... Os dois grandes, o resto em "Outros". */
function grupoDaOrigem(origem: string | null): CartaoDeOrigem["nome"] {
  const o = (origem ?? "").trim().toLowerCase();
  if (o === "ig" || o === "instagram") return "Instagram";
  if (o === "fb" || o === "facebook") return "Facebook";
  return "Outros";
}

/** Bloco "por onde": só os grupos que tiveram alguma coisa, na ordem fixa. */
export function porOnde(porOrigem: RelatorioParaTela["por_origem"]): CartaoDeOrigem[] {
  const soma = new Map<CartaoDeOrigem["nome"], CartaoDeOrigem>(
    (["Instagram", "Facebook", "Outros"] as const).map((nome) => [nome, { nome, cadastros: 0, vendido: 0 }]),
  );
  for (const o of porOrigem) {
    const atual = soma.get(grupoDaOrigem(o.origem)) as CartaoDeOrigem;
    soma.set(atual.nome, { ...atual, cadastros: atual.cadastros + o.cadastros, vendido: atual.vendido + o.vendido });
  }
  return [...soma.values()].filter((c) => c.cadastros > 0 || c.vendido !== 0);
}

export type DiaDoGrafico = {
  chave: string;
  rotulo: string;
  cadastros: number;
  entraram: number;
  dica: string;
  mostraRotulo: boolean;
};
export type GraficoPorDiaModelo = { dias: DiaDoGrafico[]; teto: number; resumo: string };

/** "2026-09-21" → "21/09". */
export function diaMes(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Quatro rótulos no eixo, nas pontas e nos terços: 90 dias não cabem em 390 px. */
function rotulados(n: number): Set<number> {
  if (n <= 0) return new Set();
  return new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1]);
}

export function graficoPorDia(porDia: RelatorioParaTela["por_dia"]): GraficoPorDiaModelo {
  const comRotulo = rotulados(porDia.length);
  const dias = porDia.map((d, i) => ({
    chave: d.dia,
    rotulo: diaMes(d.dia),
    cadastros: d.cadastros,
    entraram: d.entraram,
    dica: `${diaMes(d.dia)}: ${contagem(d.cadastros, "cadastro", "cadastros")}, ${inteiro(d.entraram)} ${d.entraram === 1 ? "entrou" : "entraram"}`,
    mostraRotulo: comRotulo.has(i),
  }));
  const pico = porDia.reduce((m, d, i) => (d.cadastros > porDia[m].cadastros ? i : m), 0);
  const totalCadastros = porDia.reduce((s, d) => s + d.cadastros, 0);
  const totalEntraram = porDia.reduce((s, d) => s + d.entraram, 0);
  const resumo =
    porDia.length === 0
      ? "Sem dias no período."
      : `Cadastros e entradas por dia, de ${diaMes(porDia[0].dia)} a ${diaMes(porDia[porDia.length - 1].dia)}: ` +
        `${contagem(totalCadastros, "cadastro", "cadastros")} e ${contagem(totalEntraram, "entrada", "entradas")}` +
        (totalCadastros > 0 ? `; pico de ${inteiro(porDia[pico].cadastros)} em ${diaMes(porDia[pico].dia)}.` : ".");
  const maximo = Math.max(0, ...porDia.map((d) => Math.max(d.cadastros, d.entraram)));
  return { dias, teto: tetoDoEixo(maximo), resumo };
}

/** Um lançamento de gasto que começa num dia (PR 7 entrega a lista). */
export type InicioDeGasto = { dia: string; campanha: string };
export type MarcaDoGrafico = { chave: string; posicao: number; texto: string };

/**
 * Anotação de início de campanha no gráfico (spec §4): um traço no começo do dia em
 * que um lançamento de gasto começa. Dia fora do período não aparece; dois começos no
 * mesmo dia dividem o traço.
 */
export function marcasDeGasto(
  porDia: RelatorioParaTela["por_dia"],
  inicios: readonly InicioDeGasto[],
): MarcaDoGrafico[] {
  const n = porDia.length;
  const indice = new Map(porDia.map((d, i) => [d.dia, i]));
  const porData = new Map<string, string[]>();
  for (const inicio of inicios) {
    if (!indice.has(inicio.dia)) continue;
    const lista = porData.get(inicio.dia) ?? [];
    if (!lista.includes(inicio.campanha)) porData.set(inicio.dia, [...lista, inicio.campanha]);
  }
  return [...porData.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dia, campanhas]) => ({
      chave: dia,
      posicao: (indice.get(dia) as number) / n,
      texto: `${diaMes(dia)} · ${campanhas.join(", ")} ${campanhas.length === 1 ? "entrou" : "entraram"} no ar`,
    }));
}

/**
 * Guarda leve do corpo de `GET /api/resultados/anuncios` no cliente. A rota já
 * validou com zod (`lerRelatorioAnuncios`); aqui só se recusa o que não é a resposta.
 */
export function ehRespostaAnuncios(corpo: unknown): corpo is RespostaAnuncios {
  const c = corpo as Partial<RespostaAnuncios> | null;
  return (
    typeof c?.tem_cadastro === "boolean" &&
    typeof c.relatorio?.total?.cadastros === "number" &&
    Array.isArray(c.relatorio.por_dia) &&
    Array.isArray(c.relatorio.por_origem) &&
    Array.isArray(c.relatorio.linhas) &&
    typeof c.relatorio.fora?.entradas_sem_cadastro === "number"
  );
}
