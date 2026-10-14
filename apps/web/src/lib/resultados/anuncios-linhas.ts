import { diaMesBR } from "@/lib/date-br";
import {
  clipDoDegrau,
  contagem,
  custoPor,
  degrausDoTotal,
  dinheiro,
  duasCasas,
  geometriaDoFunil,
  inteiro,
  porcentagem,
  porOnde,
  retorno,
  type CartaoDeOrigem,
  type FatiaDoFunil,
  type FormaDoFunil,
} from "./anuncios-tela";
import {
  SEM_ANUNCIO,
  SEM_CAMPANHA,
  SEM_CONJUNTO,
  type ChaveDoAnuncio,
  type CompradorDaGaveta,
} from "./pessoas-do-anuncio";
import type { LinhaRelatorio, NivelLinha, RelatorioParaTela } from "./relatorio-anuncios";

/**
 * Regras puras da tabela campanha › conjunto › anúncio, dos cartões do celular e
 * da gaveta "Ver quem" (spec 2026-10-10-funil-anuncios §4, mockups MiniFunil,
 * Main, Celular e Anuncio). Os componentes só desenham o que sai daqui.
 */

/** O que tabela, cartão e gaveta leem de uma linha. O total do relatório também cabe. */
export type Contas = RelatorioParaTela["total"];

/** Mini-funil A, deitado na linha da tabela (mockup MiniFunil): altura 22% + 78% × n/cadastros, bico 16%. */
export const MINI_FUNIL_A: FormaDoFunil = { piso: 22, bico: 16 };
/** Mini-funil B, em pé no cartão do celular (mockup Celular): 40% + 60%, bico 36%. */
export const MINI_FUNIL_B: FormaDoFunil = { piso: 40, bico: 36 };
/** Funil em pé da gaveta do anúncio (mockup Anuncio): 36% + 64%, bico 34%. */
export const FUNIL_GAVETA: FormaDoFunil = { piso: 36, bico: 34 };

const NOMES_DOS_DEGRAUS = ["cadastros", "foram pro grupo", "entraram", "compraram"] as const;
const valoresDe = (c: Contas) => [c.cadastros, c.foram, c.entraram, c.compradores];
const umaCasa = (n: number) => Math.round(n * 10) / 10;

/** Abre ou fecha uma linha (tabela e cartões): devolve um conjunto novo, nunca muta o de entrada. */
export function alternado(abertos: ReadonlySet<string>, chave: string): ReadonlySet<string> {
  const novo = new Set(abertos);
  if (!novo.delete(chave)) novo.add(chave);
  return novo;
}

type Nomes = Pick<LinhaRelatorio, "nivel" | "campanha" | "conjunto" | "anuncio">;

export function rotuloDaLinha(l: Nomes): string {
  if (l.nivel === "campanha") return l.campanha ?? SEM_CAMPANHA;
  if (l.nivel === "conjunto") return l.conjunto ?? SEM_CONJUNTO;
  return l.anuncio ?? SEM_ANUNCIO;
}

/** "Campanha › Conjunto", acima do nome do anúncio na gaveta. */
export function caminhoDaLinha(l: Nomes): string {
  return `${l.campanha ?? SEM_CAMPANHA} › ${l.conjunto ?? SEM_CONJUNTO}`;
}

export function chaveDaLinha(l: Nomes): ChaveDoAnuncio {
  return { campanha: l.campanha, conjunto: l.conjunto, anuncio: l.anuncio };
}

export type NoDaTabela = { chave: string; linha: LinhaRelatorio; rotulo: string; tipo: string; filhos: NoDaTabela[] };

const TIPO: Record<NivelLinha, string> = { campanha: "Campanha", conjunto: "Conjunto", anuncio: "Anúncio" };

function no(l: LinhaRelatorio, filhos: NoDaTabela[]): NoDaTabela {
  return {
    chave: JSON.stringify([l.nivel, l.campanha, l.conjunto, l.anuncio]),
    linha: l,
    rotulo: rotuloDaLinha(l),
    tipo: l.nivel === "campanha" && l.campanha === null ? "Sem parâmetros no link" : TIPO[l.nivel],
    filhos,
  };
}

/** Quem vende mais primeiro; empate por cadastros e pelo nome. */
function ordenar(nos: NoDaTabela[]): NoDaTabela[] {
  return [...nos].sort(
    (a, b) =>
      b.linha.vendido - a.linha.vendido ||
      b.linha.cadastros - a.linha.cadastros ||
      a.rotulo.localeCompare(b.rotulo, "pt-BR"),
  );
}

/**
 * As linhas do relatório (os três níveis já agregados no SQL) viram árvore.
 * "(sem UTM)" vai por último: não é campanha de verdade, mas abre como as outras
 * para quem chegou sem parâmetros também ter "Ver quem".
 */
export function arvoreDasLinhas(linhas: readonly LinhaRelatorio[]): NoDaTabela[] {
  const anunciosDe = (s: LinhaRelatorio) =>
    linhas.filter((l) => l.nivel === "anuncio" && l.campanha === s.campanha && l.conjunto === s.conjunto);
  const conjuntosDe = (c: LinhaRelatorio) =>
    linhas.filter((l) => l.nivel === "conjunto" && l.campanha === c.campanha);
  const campanhas = ordenar(
    linhas
      .filter((l) => l.nivel === "campanha")
      .map((c) => no(c, ordenar(conjuntosDe(c).map((s) => no(s, ordenar(anunciosDe(s).map((a) => no(a, [])))))))),
  );
  return [...campanhas.filter((n) => n.linha.campanha !== null), ...campanhas.filter((n) => n.linha.campanha === null)];
}

export type LinhaVisivel = { no: NoDaTabela; profundidade: number; aberto: boolean };

/** O que a tabela mostra com estas chaves abertas: filho só aparece com o pai aberto. */
export function linhasVisiveis(
  arvore: readonly NoDaTabela[],
  abertos: ReadonlySet<string>,
  profundidade = 0,
): LinhaVisivel[] {
  return arvore.flatMap((n) => {
    const aberto = n.filhos.length > 0 && abertos.has(n.chave);
    return [{ no: n, profundidade, aberto }, ...(aberto ? linhasVisiveis(n.filhos, abertos, profundidade + 1) : [])];
  });
}

export type ColunasDaLinha = { gasto: string; cadastros: string; compraram: string; vendido: string; retorno: string };

/**
 * Gasto só existe na campanha (spec §1); conjunto e anúncio chegam com `null`, e
 * quem não tem `ads:manage` também (`semGasto`). Sem gasto: travessão, nunca R$ 0.
 */
export function colunasDaLinha(c: Contas): ColunasDaLinha {
  return {
    gasto: c.gasto !== null && c.gasto > 0 ? dinheiro(c.gasto) : "—",
    cadastros: inteiro(c.cadastros),
    compraram: inteiro(c.compradores),
    vendido: dinheiro(c.vendido),
    retorno: retorno(c.vendido, c.gasto) ?? "—",
  };
}

/**
 * Recorte do degrau deitado: a altura (`largura` da geometria) centrada na
 * vertical, fechando à direita na altura do próximo — `recuo` é % da própria
 * altura, de cada lado (a mesma conta do funil grande, girada).
 */
export function clipDeitado(f: FatiaDoFunil): string {
  const proxima = f.largura * (1 - (2 * f.recuo) / 100);
  const a = umaCasa((100 - f.largura) / 2);
  const b = umaCasa((100 - proxima) / 2);
  return `polygon(0 ${a}%, 100% ${b}%, 100% ${umaCasa(100 - b)}%, 0 ${umaCasa(100 - a)}%)`;
}

export type MiniFunilModelo = { segmentos: { clip: string; titulo: string }[]; taxa: string; leitor: string };

/**
 * Mini-funil A (spec §4): quatro degraus deitados com a altura relativa aos
 * cadastros da PRÓPRIA linha, a taxa de compra na ponta, o número de cada degrau
 * no `title` e tudo em texto para o leitor de tela.
 */
export function miniFunilA(c: Contas): MiniFunilModelo {
  const valores = valoresDe(c);
  const textos = valores.map((v, i) => `${inteiro(v)} ${NOMES_DOS_DEGRAUS[i]}`);
  return {
    segmentos: geometriaDoFunil(valores, MINI_FUNIL_A).map((f, i) => ({ clip: clipDeitado(f), titulo: textos[i] })),
    taxa: porcentagem(c.compradores, c.cadastros) ?? "—",
    leitor: `Funil: ${textos.join(", ")}.`,
  };
}

export type DegrauEmPe = {
  chave: string;
  valor: number;
  rotulo: string;
  /** Só a taxa ("94%"); o primeiro degrau não tem. */
  passagem: string;
  largura: number;
  clip: string;
};
export type FunilEmPeModelo = { degraus: DegrauEmPe[]; bico: { largura: number; valor: string; pedidos: string } };

/** Funil em pé pequeno (cartão B e gaveta): a geometria do PR 5 com outra forma. */
export function funilEmPe(c: Contas, forma: FormaDoFunil): FunilEmPeModelo {
  const geometria = geometriaDoFunil(valoresDe(c), forma);
  return {
    degraus: degrausDoTotal(c).map((d, i) => ({
      chave: d.chave,
      valor: d.valor,
      rotulo: NOMES_DOS_DEGRAUS[i],
      passagem: i === 0 ? "" : (d.taxa ?? d.passagem),
      largura: geometria[i].largura,
      clip: clipDoDegrau(geometria[i].recuo),
    })),
    bico: { largura: forma.bico, valor: dinheiro(c.vendido), pedidos: contagem(c.pedidos, "pedido", "pedidos") },
  };
}

export type CartaoDeCampanha = {
  chave: string;
  rotulo: string;
  aviso: string | null;
  gasto: string;
  funil: FunilEmPeModelo;
  retorno: string;
  compram: string;
  porComprador: string;
  /** "Ver 2 conjuntos e 4 anúncios"; `null` sem filhos. */
  mais: string | null;
};

/** Mini-funil B (spec §4, celular): um cartão por campanha. */
export function cartaoDaCampanha(n: NoDaTabela): CartaoDeCampanha {
  const l = n.linha;
  const anuncios = n.filhos.reduce((soma, s) => soma + s.filhos.length, 0);
  return {
    chave: n.chave,
    rotulo: n.rotulo,
    aviso: l.campanha === null ? "Chegaram sem os parâmetros do anúncio no link." : null,
    gasto: colunasDaLinha(l).gasto,
    funil: funilEmPe(l, MINI_FUNIL_B),
    retorno: retorno(l.vendido, l.gasto) ?? "—",
    compram: porcentagem(l.compradores, l.cadastros) ?? "—",
    porComprador: custoPor(l.gasto, l.compradores) ?? "—",
    mais:
      n.filhos.length === 0
        ? null
        : `Ver ${contagem(n.filhos.length, "conjunto", "conjuntos")} e ${contagem(anuncios, "anúncio", "anúncios")}`,
  };
}

/** Uma linha de conjunto ou anúncio no cartão aberto: "141 cadastros · 16 compraram · R$ 7.920". */
export function resumoDaLinha(c: Contas): string {
  return `${contagem(c.cadastros, "cadastro", "cadastros")} · ${inteiro(c.compradores)} ${
    c.compradores === 1 ? "comprou" : "compraram"
  } · ${dinheiro(c.vendido)}`;
}

export type FatiaDeOrigem = { nome: CartaoDeOrigem["nome"]; largura: number; texto: string };

/** "Por onde a pessoa viu" na gaveta: a barra em % dos cadastros, com os grupos do `porOnde` da aba. */
export function fatiasDeOrigem(porOrigem: RelatorioParaTela["por_origem"]): FatiaDeOrigem[] {
  const cartoes = porOnde(porOrigem).filter((c) => c.cadastros > 0);
  const total = cartoes.reduce((s, c) => s + c.cadastros, 0);
  return cartoes.map((c) => ({
    nome: c.nome,
    largura: duasCasas((c.cadastros / total) * 100),
    texto: `${c.nome} ${porcentagem(c.cadastros, total) ?? ""}`,
  }));
}

export type LinhaDoComprador = { titulo: string; detalhe: string; total: string; quando: string };

/**
 * Uma pessoa em "Quem comprou". O worker quase nunca tem o nome do WhatsApp:
 * sem nome, o telefone (já mascarado pela rota) é o título.
 */
export function linhaDoComprador(c: CompradorDaGaveta): LinhaDoComprador {
  const nome = c.nome?.trim() || null;
  return {
    titulo: nome ?? c.telefone,
    detalhe: [nome ? c.telefone : null, c.grupo, c.em_contatos ? null : "não está em Contatos"]
      .filter(Boolean)
      .join(" · "),
    total: dinheiro(c.vendido),
    quando: [
      `cadastro ${diaMesBR(c.cadastro_em) ?? "—"}`,
      `1ª compra ${diaMesBR(c.primeira_compra) ?? "—"}`,
      c.pedidos > 1 ? `${inteiro(c.pedidos)} pedidos` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export function verEmContatos(n: number): string {
  return n === 1 ? "Ver a pessoa em Contatos" : `Ver os ${inteiro(n)} em Contatos`;
}

/** Quem comprou só com telefone no pedido (ninguém com o número entrou num grupo). */
export function notaForaDeContatos(n: number): string | null {
  if (n <= 0) return null;
  return `${contagem(n, "pessoa comprou", "pessoas compraram")} sem estar em Contatos: o telefone veio só no pedido.`;
}

export function textoDeSemCompra(semCompra: number, entraram: number): string {
  if (semCompra > 0) return "Entraram pelo anúncio. Uma oferta postada no grupo alcança quem continua lá.";
  return entraram === 0
    ? "Ninguém entrou no grupo por este anúncio ainda."
    : "Quem entrou por este anúncio já comprou.";
}
