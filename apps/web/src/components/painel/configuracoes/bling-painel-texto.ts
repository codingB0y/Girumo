// apps/web/src/components/painel/configuracoes/bling-painel-texto.ts
import type { CanalDoCartao, CartaoBling, OpcaoDePixel, SituacaoDoCartao, UltimaDoCartao } from "@/lib/bling/cartao";
import { SITUACAO } from "@/lib/bling/classificar";
import { diaMesBR } from "@/lib/date-br";
import { parseValorDoPedido } from "@/lib/orders/valor-do-pedido";
import { haQuanto, quando } from "./site-proprio-painel";

/**
 * Textos do cartão do Bling (spec 2026-10-13-integracao-bling §6), fora do desenho para
 * serem testados sem navegador. Mesmos relógios do Site próprio (`haQuanto`, `quando`).
 */

export type ConexaoDoCartao = NonNullable<CartaoBling["conexao"]>;
export type AjustesDoCartao = NonNullable<CartaoBling["ajustes"]>;
export type NumerosDoCartao = NonNullable<CartaoBling["numeros_30d"]>;
export type ListaDoCartao = keyof NonNullable<CartaoBling["listas"]>;
export type Tom = "ok" | "alerta" | "erro" | "neutro";
/** A ação em curso no cartão: uma por vez, os outros botões esperam. */
export type Ocupado = "conectar" | "salvar" | "desconectar" | `csv:${ListaDoCartao}` | null;

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const REAIS_INTEIROS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const DUAS_CASAS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const reais = (v: number) => REAIS.format(v);
/** "R$ 1.500" quando é inteiro; com centavos, eles aparecem. */
export const reaisCurtos = (v: number) => (Number.isInteger(v) ? REAIS_INTEIROS : REAIS).format(v);
export const contagem = (n: number) => n.toLocaleString("pt-BR");

export function chipDoBling(c: Pick<ConexaoDoCartao, "status" | "tempo_real">): { texto: string; tom: Tom } {
  if (c.status === "reconectar") return { texto: "Sem acesso", tom: "erro" };
  if (c.tempo_real === "parado") return { texto: "Tempo real parado", tom: "alerta" };
  return { texto: "Conectado", tom: "ok" };
}

export function linhaDeEstado(c: Pick<ConexaoDoCartao, "ultima_venda_em">, agora: Date): { titulo: string; detalhe: string | null } {
  if (!c.ultima_venda_em) return { titulo: "Ainda sem vendas", detalhe: null };
  return { titulo: "Recebendo", detalhe: `última venda ${haQuanto(c.ultima_venda_em, agora)}` };
}

/** Sem aviso nenhum, "parado" é a varredura achando venda que o Bling nunca avisou. */
export function tituloDoParado(ultimoAviso: string | null, agora: Date): string {
  return ultimoAviso ? `Tempo real parado ${haQuanto(ultimoAviso, agora)}` : "Tempo real parado";
}

export function linhaDaPausa(pausadaAte: string, agora: Date): string {
  return `Pausado até ${quando(pausadaAte, agora)} por erros seguidos do Bling — volta sozinho.`;
}

/** A hora da recusa não vem no cartão: a última venda recebida é o que dá para afirmar. */
export function textoDoReconectar(ultimaVenda: string | null, agora: Date): string {
  const base = "A autorização foi removida no Bling ou venceu. Nenhuma venda nova está chegando.";
  return ultimaVenda ? `${base} Última venda recebida: ${quando(ultimaVenda, agora)}.` : base;
}

const RETORNOS: Record<string, { texto: string; tom: Tom }> = {
  conectado: {
    texto: "Bling conectado. As vendas novas já entram; as dos últimos 90 dias chegam nos próximos minutos.",
    tom: "ok",
  },
  recusado: { texto: "A conexão foi cancelada na tela do Bling. Nada mudou aqui.", tom: "neutro" },
  sessao: { texto: "A autorização venceu ou começou em outro navegador. Clique em Conectar Bling de novo.", tom: "erro" },
  outra_loja: {
    texto: "Esta conta do Bling já está ligada a outra loja da Girumo. Desconecte por lá antes de ligar aqui.",
    tom: "erro",
  },
  erro: { texto: "O Bling não concluiu a conexão. Tente de novo em alguns minutos.", tom: "erro" },
  indisponivel: { texto: "Integração com o Bling indisponível no momento.", tom: "neutro" },
};

/** O `?bling=` da volta do OAuth (rota `retorno`). Valor desconhecido não vira mensagem. */
export function mensagemDoRetorno(motivo: string | null): { texto: string; tom: Tom } | null {
  return motivo !== null && Object.hasOwn(RETORNOS, motivo) ? RETORNOS[motivo] : null;
}

const MOTIVO_DA_TRAVA: Record<number, string> = {
  [SITUACAO.CANCELADO]: "nunca conta: vira lead qualificado",
  [SITUACAO.EM_DIGITACAO]: "ignorado até sair da digitação",
};

/** Situação própria herda de uma padrão (`base`); a trava vale pela base, como no motor. */
export function legendaDaSituacao(s: SituacaoDoCartao, todas: readonly SituacaoDoCartao[]): string {
  const propria = s.id !== s.base;
  const herda = `herda de ${todas.find((t) => t.id === s.base)?.nome ?? "outra situação"}`;
  if (s.bloqueada) {
    const motivo = MOTIVO_DA_TRAVA[s.base] ?? "nunca conta como venda";
    return propria ? `${herda} · ${motivo}` : motivo;
  }
  if (propria) return `situação própria · ${herda}`;
  return s.base === SITUACAO.ATENDIDO ? "situação do Bling · marcada por padrão" : "situação do Bling";
}

export function resumoDasSituacoes(situacoes: readonly SituacaoDoCartao[]): string {
  const nomes = situacoes.filter((s) => s.conta).map((s) => s.nome);
  return nomes.length > 0 ? nomes.join(", ") : "nenhuma";
}

/** As situações no corpo do Salvar: as marcadas e a versão das que a dona viu (o PATCH responde 409 se mudaram). */
export type SituacoesParaSalvar = { sale_situation_ids?: number[]; situacoes_versao?: string };

/**
 * As situações só vão no Salvar se a dona mexeu nas caixas: uma situação nova que o motor leu com o formulário
 * aberto não vira escolha por acidente (o padrão de antes dela seria gravado). Desmarcar e marcar de volta não é mexer.
 * `a` é a lista e a versão que o formulário mostrou (a foto de quando ele abriu), não as do cartão recarregado.
 */
export function situacoesParaSalvar(
  a: Pick<AjustesDoCartao, "situacoes" | "situacoes_versao">,
  marcadas: ReadonlySet<number>,
): SituacoesParaSalvar {
  const vistas = a.situacoes.filter((s) => s.conta).map((s) => s.id);
  const mexeu = vistas.length !== marcadas.size || vistas.some((id) => !marcadas.has(id));
  return mexeu ? { sale_situation_ids: [...marcadas].sort((x, y) => x - y), situacoes_versao: a.situacoes_versao } : {};
}

/** A venda vai como Purchase; o pedido, como InitiateCheckout (cartao.ts). */
export function textoDoMeta(u: Pick<UltimaDoCartao, "meta" | "hora" | "tipo">): { texto: string; detalhe: string | null; tom: Tom } {
  const a = u.tipo === "venda" ? "a" : "o";
  switch (u.meta) {
    case "enviado":
      return { texto: `Enviad${a}`, detalhe: null, tom: "ok" };
    case "fora_da_janela":
      return { texto: "Fora da janela", detalhe: u.hora ? `${u.tipo} de ${diaMesBR(u.hora)}` : null, tom: "neutro" };
    case "sem_dados":
      return { texto: `Não enviad${a}: sem telefone nem e-mail`, detalhe: null, tom: "alerta" };
    case "sem_pixel":
      return { texto: `Não enviad${a}: sem pixel`, detalhe: null, tom: "alerta" };
    case "desligado":
      return { texto: "Envio desligado", detalhe: null, tom: "neutro" };
    case "erro":
      return { texto: "Erro no envio", detalhe: "tenta de novo sozinho", tom: "erro" };
    default:
      return { texto: "Aguardando", detalhe: null, tom: "neutro" };
  }
}

export function textoDaOrigem(u: Pick<UltimaDoCartao, "origem" | "origem_detalhe">): string {
  const detalhe = u.origem_detalhe ? ` · ${u.origem_detalhe}` : "";
  if (u.origem === "anuncio") return `Anúncio${detalhe}`;
  if (u.origem === "grupo") return `Grupo${detalhe}`;
  if (u.origem === "sem_origem") return "Sem origem";
  return "—";
}

/** O que não foi ao Meta nos 30 dias, e por quê. */
export function detalheDoMeta(m: NumerosDoCartao["meta"]): string {
  const partes = (
    [
      [m.fora_da_janela, "fora da janela de 7 dias do Meta"],
      [m.sem_dados, "sem telefone nem e-mail"],
      [m.sem_pixel, "sem pixel"],
      [m.desligado, "com o envio desligado"],
      [m.erro, "com erro"],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, rotulo]) => `${contagem(n)} ${rotulo}`);
  return partes.length > 0 ? partes.join(" · ") : "nenhuma ficou de fora";
}

/** `falhas` e `pendentes` são de todos os pedidos, não só dos 30 dias (`bling_resumo`). */
export function detalheDasFalhas(falhas: number, pendentes: number): string {
  const base = falhas > 0 ? "não entraram; voltam se o pedido mudar no Bling" : "nenhuma";
  return pendentes > 0 ? `${base} · ${contagem(pendentes)} na fila agora` : base;
}

export const LISTAS: readonly ListaDoCartao[] = ["alto_valor", "comprador", "lead"];

export const NOMES_DAS_LISTAS: Record<ListaDoCartao, string> = {
  alto_valor: "Alto valor",
  comprador: "Compradores",
  lead: "Leads qualificados",
};

/** Regras da spec §1 "Listas": cada pessoa em uma só. */
export function regraDaLista(lista: ListaDoCartao, valorAlto: number | null): string {
  if (lista === "lead") return "Fizeram pedido e não pagaram (em aberto ou cancelado)";
  if (valorAlto === null) {
    return lista === "alto_valor" ? "Desligada: defina o valor alto nos ajustes" : "Compraram pelo menos uma vez";
  }
  const corte = reaisCurtos(valorAlto);
  return lista === "alto_valor" ? `Pelo menos uma venda a partir de ${corte}` : `Compraram, nenhuma venda a partir de ${corte}`;
}

/** Os públicos que a loja cria uma vez no Gerenciador (spec §4 "Públicos"). */
export const RECEITAS_DOS_PUBLICOS: readonly { nome: string; regra: string }[] = [
  { nome: "Alto valor", regra: "Evento Purchase · últimos 180 dias · parâmetro faixa = alto" },
  { nome: "Compradores", regra: "Evento Purchase · últimos 180 dias · excluir o público Alto valor" },
  { nome: "Leads qualificados", regra: "Evento InitiateCheckout · últimos 180 dias · excluir quem fez Purchase" },
];

/** Valor alto no campo: "1.500,00" volta pelo `lerValorAlto` sem perder o milhar. */
export function campoDoValor(v: number | null): string {
  return v === null ? "" : DUAS_CASAS.format(v);
}

const SO_MILHAR = /^\d{1,3}(\.\d{3})+$/;
const ATE_DUAS_CASAS = /^\d+(\.\d{1,2})?$/;
const TETO_DO_VALOR = 10_000_000;

export const MENSAGEM_DO_VALOR = "Valor alto: maior que zero, até R$ 10.000.000,00 e com até 2 casas decimais.";

export type ValorLido = { ok: true; valor: number | null } | { ok: false };

/**
 * Vazio desliga a lista (null). "1.500" é mil e quinhentos: o `parseValorDoPedido` sozinho
 * leria 1,5 e jogaria quase toda cliente em Alto valor. A régua é a do PATCH (zod).
 */
export function lerValorAlto(texto: string): ValorLido {
  const t = texto.trim().replace(/^R\$\s*/i, "");
  if (!t) return { ok: true, valor: null };
  const n = SO_MILHAR.test(t) ? Number(t.replaceAll(".", "")) : parseValorDoPedido(t);
  const valido = Number.isFinite(n) && n > 0 && n <= TETO_DO_VALOR && ATE_DUAS_CASAS.test(String(n));
  return valido ? { ok: true, valor: n } : { ok: false };
}

/** O pixel que recebe as vendas: o da campanha escolhida, ou o único das campanhas (spec §4 "Pixel"). */
export function pixelEmUso(p: AjustesDoCartao["pixel"]): string | null {
  if (p.escolhido) return p.opcoes.find((o) => o.campaign_id === p.escolhido)?.pixel_id ?? null;
  const pixels = new Set(p.opcoes.map((o) => o.pixel_id));
  return pixels.size === 1 ? [...pixels][0] : null;
}

export function resumoDoMeta(a: Pick<AjustesDoCartao, "meta_enabled" | "pixel" | "canais">): string {
  if (!a.meta_enabled) return "desligado";
  const pixel = pixelEmUso(a.pixel);
  const base = pixel ? `ligado · Pixel ${pixel}` : "ligado · sem pixel escolhido";
  const fora = a.canais.filter((c) => c.fora_do_meta).length;
  return fora === 0 ? base : `${base} · ${fora} ${fora === 1 ? "canal" : "canais"} fora`;
}

/**
 * Os canais só vão no Salvar se a dona mexeu nas caixas: mandar sempre a lista da abertura desfaria, sem ela ver, o
 * canal que outra aba tirou do Meta nesse meio tempo — e o canal "devolvido" reabre 7 dias de eventos ao Meta.
 */
export function canaisParaSalvar(
  vistos: readonly Pick<CanalDoCartao, "id" | "fora_do_meta">[],
  fora: ReadonlySet<number>,
): { meta_skip_store_ids?: number[] } {
  const antes = vistos.filter((c) => c.fora_do_meta).map((c) => c.id);
  const mexeu = antes.length !== fora.size || antes.some((id) => !fora.has(id));
  return mexeu ? { meta_skip_store_ids: [...fora].sort((x, y) => x - y) } : {};
}

/** O nome que a conta deu no Bling; sem o escopo de canais no app, só o número (o `loja.id`). */
export function nomeDoCanal(c: Pick<CanalDoCartao, "id" | "nome">): string {
  return c.nome ?? `Canal ${c.id}`;
}

/** Nomes que aparecem em mais de um canal (duas contas do mesmo marketplace sem descrição: o nome vira o tipo). */
export function nomesRepetidos(canais: readonly Pick<CanalDoCartao, "nome">[]): ReadonlySet<string> {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const { nome } of canais) if (nome !== null) (vistos.has(nome) ? repetidos : vistos).add(nome);
  return repetidos;
}

/**
 * O tipo (Yampi, Shopee) e os números dos pedidos: é por eles que a dona acha o canal no Bling. `repetido` = outro canal
 * tem o mesmo nome: o número dele entra, senão as duas linhas seriam iguais e marcar a errada duplicaria a venda no Meta.
 */
export function legendaDoCanal(
  c: Pick<CanalDoCartao, "id" | "nome" | "tipo" | "ativo" | "pedidos" | "exemplos" | "ultimo_pedido_em">,
  repetido = false,
): string {
  // Dia do pedido no Bling ("YYYY-MM-DD"): sem passar por Date, que o leria em UTC e voltaria um dia em Brasília.
  const [, mes, dia] = c.ultimo_pedido_em?.split("-") ?? [];
  const pedidos = c.pedidos === 0 ? "sem pedido recente" : c.pedidos === 1 ? "1 pedido" : `${contagem(c.pedidos)} pedidos`;
  return [
    repetido ? `Canal ${c.id}` : null,
    c.tipo && c.tipo !== c.nome ? c.tipo : null,
    c.ativo ? null : "desabilitado no Bling",
    pedidos,
    dia && mes ? `último em ${dia}/${mes}` : null,
    c.exemplos.length > 0 ? `nº ${c.exemplos.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function rotuloDoPixel(o: OpcaoDePixel): string {
  return `${o.campanha || "Campanha sem nome"} · Pixel ${o.pixel_id}`;
}

/** Sem campanha escolhida o servidor só acha o pixel quando as campanhas usam um único. */
export function rotuloDoAutomatico(opcoes: readonly OpcaoDePixel[]): string {
  const pixels = new Set(opcoes.map((o) => o.pixel_id));
  return pixels.size === 1 ? `Automático · Pixel ${[...pixels][0]}` : "Automático: há mais de um pixel, escolha a campanha";
}

/** O nome que a rota dá ao arquivo (`content-disposition`); sem ele, um nome com a lista. */
export function nomeDoCsv(disposicao: string | null, lista: ListaDoCartao): string {
  return disposicao?.match(/filename="([^"]+)"/)?.[1] ?? `girumo-${lista}.csv`;
}
