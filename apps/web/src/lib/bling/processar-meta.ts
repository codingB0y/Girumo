import "server-only";

import type { GraphError } from "@/lib/campaigns/meta-capi";
import type { ConexaoBling } from "@/lib/stores/bling-conexoes";
import type { ContatoGuardado } from "@/lib/stores/bling-contatos";
import type { LinhaPedidoBling, ResultadoProcessamento, StatusEvento } from "@/lib/stores/bling-pedidos";
import type { CadastroDaVenda } from "@/lib/stores/site-captures";

import { dentroDaJanelaMeta, horaDoPedido } from "./classificar";
import type { DepsBling } from "./deps";
import {
  escolherPixel,
  eventoInitiateCheckout,
  eventoPurchase,
  faixaDoValor,
  temDadosDeCasamento,
  type CampanhaComMetadata,
  type EntradaEvento,
  type PixelEscolhido,
} from "./eventos-meta";
import { cabeAChamada, ParadaDaRodada, rotulo, TAMANHO_DO_ERRO } from "./sincronizar-execucao";
import type { PedidoResumo, TipoPedido } from "./tipos";

/**
 * Os eventos do Meta de um pedido do Bling (spec §4 "Eventos"): InitiateCheckout na primeira vez
 * que ele é pedido ou venda, Purchase na primeira vez que é venda, os dois num envio só. `enviado`
 * nunca sai de novo (a dedup servidor × servidor não é documentada) e `fora_da_janela` é final; os
 * outros estados tentam de novo no próximo processamento do pedido.
 */

export type ContextoMeta = {
  tenantId: string;
  conexao: ConexaoBling;
  deps: DepsBling;
  agora: () => Date;
  /**
   * Até quando a trava segura a loja (epoch ms, no relógio de `agora`; nunca além da vida da função): o envio
   * ao Meta só começa se o timeout inteiro, mais 2 s para gravar o status, termina antes dele.
   */
  fimDaTrava: number;
  /** Campanhas da loja, lidas uma vez por execução (e só se algum pedido chegar ao pixel). */
  campanhas: () => Promise<CampanhaComMetadata[]>;
};

export type EntradaMeta = {
  ctx: ContextoMeta;
  linha: LinhaPedidoBling;
  tipo: TipoPedido;
  estado: PedidoResumo | null;
  contato: ContatoGuardado | null;
  saleAt: Date | null;
  origem: "anuncio" | "grupo" | "sem_origem" | null;
  /** Cadastro do site até a hora da venda (o mesmo da origem). Pedido busca o dele, até a hora do pedido. */
  cadastro: CadastroDaVenda | null;
};

export type EstadoMeta = Pick<ResultadoProcessamento, "icStatus" | "icSentAt" | "purchaseStatus" | "purchaseSentAt" | "metaError">;
/** `falhou` = o Meta recusou (o pedido volta à fila); `enviou` = houve envio (o efeito é gravado na hora). */
export type ResultadoDoMeta = EstadoMeta & { falhou: boolean; enviou: boolean };

type Evento = "ic" | "purchase";
type Pendente = { evento: Evento; quando: Date };
/** `status` null = vai no envio. */
type Decisao = Pendente & { status: StatusEvento | null };
type Envio = { ok: true } | { ok: false; erro: string };

const FINAIS: ReadonlySet<string> = new Set<StatusEvento>(["enviado", "fora_da_janela"]);
/** O envio leva no máximo 10 s, sempre: só começa se esse timeout inteiro cabe (`cabeAChamada`). */
const TIMEOUT_MS = 10_000;

/**
 * O que a linha já tem. A store não devolve as datas de envio: elas só saem preenchidas quando o
 * evento é enviado agora, e a store deixa de fora a data nula (a de um envio anterior fica).
 */
export function estadoDaLinha(l: LinhaPedidoBling): EstadoMeta {
  return { icStatus: l.icStatus, icSentAt: null, purchaseStatus: l.purchaseStatus, purchaseSentAt: null, metaError: l.metaError };
}

export async function eventosDoMeta(e: EntradaMeta): Promise<ResultadoDoMeta> {
  const pendentes = e.estado ? eventosPendentes(e, e.estado) : [];
  if (!e.estado || pendentes.length === 0) return { ...estadoDaLinha(e.linha), falhou: false, enviou: false };
  const pixel = umaVez(async () => escolherPixel(await e.ctx.campanhas(), e.ctx.conexao.metaCampaignId));
  const cadastro = umaVez(() => cadastroDoEvento(e, pendentes[0].quando));
  const decisoes: Decisao[] = [];
  for (const p of pendentes) decisoes.push({ ...p, status: await statusDoEvento(e, p.quando, pixel, cadastro) });
  const aEnviar = decisoes.filter((d) => d.status === null);
  const escolha = aEnviar.length > 0 ? await pixel() : null;
  const envio = escolha && escolha.ok ? await enviar(e, e.estado, escolha.pixel, aEnviar, await cadastro()) : null;
  return resultado(e, decisoes, envio);
}

function eventosPendentes(e: EntradaMeta, estado: PedidoResumo): Pendente[] {
  if (e.tipo !== "venda" && e.tipo !== "pedido") return [];
  const lista: Pendente[] = [];
  const vistoEm = new Date(e.linha.firstSeenAt);
  if (!FINAIS.has(e.linha.icStatus ?? "")) lista.push({ evento: "ic", quando: horaDoPedido(estado.data, vistoEm, e.ctx.agora()) });
  if (e.tipo === "venda" && e.saleAt && !FINAIS.has(e.linha.purchaseStatus ?? "")) {
    lista.push({ evento: "purchase", quando: e.saleAt });
  }
  return lista;
}

/** A ordem da spec §4: desligado → fora da janela → sem pixel → sem dados de casamento. */
async function statusDoEvento(
  e: EntradaMeta,
  quando: Date,
  pixel: () => Promise<ReturnType<typeof escolherPixel>>,
  cadastro: () => Promise<CadastroDaVenda | null>,
): Promise<StatusEvento | null> {
  if (!e.ctx.conexao.metaEnabled) return "desligado";
  if (!dentroDaJanelaMeta(quando, e.ctx.agora())) return "fora_da_janela";
  // Vários pixels sem escolha também é "sem pixel": o cartão pede para a loja escolher.
  if (!(await pixel()).ok) return "sem_pixel";
  const c = await cadastro();
  if (!temDadosDeCasamento(e.contato?.metaHashes ?? {}, c?.fbc ?? null, c?.fbp ?? null)) return "sem_dados";
  return null;
}

/** Venda: o da origem (até a hora da venda). Pedido: o mais recente até a hora do pedido. */
async function cadastroDoEvento(e: EntradaMeta, quando: Date): Promise<CadastroDaVenda | null> {
  if (e.tipo === "venda") return e.cadastro;
  const chave = e.contato?.phoneKey;
  return chave ? e.ctx.deps.cadastros.ultimoDaChave(e.ctx.tenantId, chave, quando) : null;
}

async function enviar(
  e: EntradaMeta,
  estado: PedidoResumo,
  pixel: PixelEscolhido,
  eventos: readonly Decisao[],
  cadastro: CadastroDaVenda | null,
): Promise<Envio> {
  // Não é falha do pedido: ele fica pendente como estava (a venda em `orders` já está ligada). Nunca encurtado:
  // o Meta que concluísse um envio que nós abortamos receberia os eventos de novo na volta seguinte.
  if (!cabeAChamada(e.ctx.fimDaTrava, e.ctx.agora().getTime(), TIMEOUT_MS)) throw new ParadaDaRodada("orcamento");
  const base: Omit<EntradaEvento, "quando"> = {
    pedidoBlingId: e.linha.blingOrderId,
    numero: estado.numero,
    total: estado.total,
    hashes: e.contato?.metaHashes ?? {},
    fbc: cadastro?.fbc ?? null,
    fbp: cadastro?.fbp ?? null,
    origem: e.origem ?? "sem_origem",
    faixa: faixaDoValor(estado.total, e.ctx.conexao.highValue),
  };
  const data = eventos.map((d) => (d.evento === "ic" ? eventoInitiateCheckout : eventoPurchase)({ ...base, quando: d.quando }));
  const r = await e.ctx.deps.meta.enviar({
    pixelId: pixel.pixelId,
    token: pixel.token,
    // O código de teste só vem da campanha que a loja escolheu (`escolherPixel`).
    payload: { data, ...(pixel.testCode ? { test_event_code: pixel.testCode } : {}) },
    timeoutMs: TIMEOUT_MS,
  });
  if (r.ok) return { ok: true };
  const erro = (r.error?.trim() || "O Meta recusou o envio.").slice(0, TAMANHO_DO_ERRO);
  console.warn(`[bling/processar] ${rotulo(e.ctx.tenantId, e.linha.blingOrderId)}: o Meta recusou o envio: ${erro}${rastroDoMeta(r.raw)}`);
  return { ok: false, erro };
}

/** O `fbtrace_id` é o que o suporte do Meta pede para achar o caso. Vem de fora: só se tiver cara de id. */
function rastroDoMeta(raw: GraphError | undefined): string {
  const id = raw?.fbtrace_id;
  return typeof id === "string" && /^[\w-]{1,100}$/.test(id) ? ` (fbtrace_id ${id})` : "";
}

function resultado(e: EntradaMeta, decisoes: readonly Decisao[], envio: Envio | null): ResultadoDoMeta {
  const agora = e.ctx.agora();
  const final = (d: Decisao): StatusEvento => d.status ?? (envio?.ok ? "enviado" : "erro");
  const enviadoEm = (d: Decisao | undefined): Date | null => (d && d.status === null && envio?.ok ? agora : null);
  const ic = decisoes.find((d) => d.evento === "ic");
  const purchase = decisoes.find((d) => d.evento === "purchase");
  const icStatus = ic ? final(ic) : e.linha.icStatus;
  const purchaseStatus = purchase ? final(purchase) : e.linha.purchaseStatus;
  const erro = envio && !envio.ok ? envio.erro : null;
  // Sem envio agora, a mensagem antiga só fica enquanto algum evento continua em erro.
  const metaError = erro ?? (icStatus === "erro" || purchaseStatus === "erro" ? e.linha.metaError : null);
  return {
    icStatus,
    icSentAt: enviadoEm(ic),
    purchaseStatus,
    purchaseSentAt: enviadoEm(purchase),
    metaError,
    falhou: erro !== null,
    enviou: envio !== null,
  };
}

function umaVez<T>(f: () => Promise<T>): () => Promise<T> {
  let promessa: Promise<T> | null = null;
  return () => (promessa ??= f());
}
