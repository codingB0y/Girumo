import "server-only";

import { createHash } from "node:crypto";

import { BASES_BLOQUEADAS, idsDeVendaEfetivos, situacoesOuPadrao } from "@/lib/bling/classificar";
import { blingDisponivel } from "@/lib/bling/deps";
import { opcoesDePixel } from "@/lib/bling/eventos-meta";
import type { CanalBling, SituacaoBling } from "@/lib/bling/tipos";
import { telefoneMascarado } from "@/lib/pages/phone";
import { lerConexao, type ConexaoBling, type StatusConexao } from "@/lib/stores/bling-conexoes";
import { lerContatosPorIds, type ContatoGuardado } from "@/lib/stores/bling-contatos";
import {
  lerResumo,
  pedidosComCanal,
  ultimasDoCartao,
  type LinhaPedidoBling,
  type PedidoComCanal,
  type ResumoBling,
  type StatusEvento,
} from "@/lib/stores/bling-pedidos";
import { listCampaignGroups, type CampaignGroup } from "@/lib/stores/campaign-groups";

/**
 * O JSON do cartão do Bling em Configurações › Integrações (spec 2026-10-13-integracao-bling §5/§6).
 * Nenhum token sai daqui: nem os do Bling (cifrados na conexão) nem o da CAPI das campanhas.
 * Telefone sempre mascarado; e-mail, nascimento e endereço nem chegam (só existem em hash).
 */

const ULTIMAS = 8;
/**
 * Os canais saem dos pedidos mais novos da loja: um canal parado há mais que isso some da lista (se não estiver fora do
 * Meta). ponytail: a consulta anda a chave primária da loja filtrando o jsonb; índice parcial em `snapshot->'lojaId'`
 * se o cartão de uma loja grande ficar lento.
 */
const PEDIDOS_DOS_CANAIS = 1000;
const EXEMPLOS_POR_CANAL = 3;
const HORA_MS = 3_600_000;
/** Sem aviso há mais que isso e a varredura achando venda: o Bling parou de avisar. */
const SILENCIO_DO_AVISO_MS = 6 * HORA_MS;
/** Erro de execução some do cartão depois de um dia; o de acesso recusado fica até reconectar. */
const VIDA_DO_ERRO_MS = 24 * HORA_MS;

export type TempoReal = "ok" | "parado" | "sem_dados";
export type SituacaoDoCartao = { id: number; nome: string; base: number; conta: boolean; bloqueada: boolean };
export type OpcaoDePixel = { campaign_id: string; campanha: string; pixel_id: string };

/**
 * Um canal de venda do Bling (`loja.id`): da conta (`GET /canais-venda`, com nome) ou visto nos pedidos. Sem o escopo
 * de canais no app, só o número: a dona reconhece o canal pelos números dos pedidos dele.
 */
export type CanalDoCartao = {
  id: number;
  /** A descrição que a conta deu (senão o tipo); null = sem o escopo, ou canal que a conta não lista mais. */
  nome: string | null;
  tipo: string | null;
  /** false = desabilitado no Bling. Canal visto só nos pedidos conta como ativo. */
  ativo: boolean;
  pedidos: number;
  /** Número no Bling dos pedidos mais novos do canal. */
  exemplos: string[];
  ultimo_pedido_em: string | null;
  fora_do_meta: boolean;
};

export type UltimaDoCartao = {
  hora: string | null;
  cliente: string | null;
  telefone_mascarado: string | null;
  valor: number | null;
  tipo: "venda" | "pedido";
  origem: LinhaPedidoBling["origem"];
  origem_detalhe: string | null;
  meta: StatusEvento | null;
  situacao: string | null;
};

export type CartaoBling = {
  disponivel: boolean;
  conexao: {
    status: StatusConexao;
    empresa: string | null;
    conectada_em: string;
    ultima_venda_em: string | null;
    ultimo_aviso_em: string | null;
    tempo_real: TempoReal;
    pausada_ate: string | null;
    ultimo_erro: string | null;
  } | null;
  historico: { lidos: number; concluido: boolean } | null;
  ajustes: {
    situacoes: SituacaoDoCartao[];
    /** A versão das situações mostradas (`versaoDasSituacoes`): o Salvar a devolve junto com as marcadas. */
    situacoes_versao: string;
    high_value: number | null;
    meta_enabled: boolean;
    pixel: { escolhido: string | null; opcoes: OpcaoDePixel[] };
    /** Canais vistos nos pedidos recentes, e os tirados do Meta mesmo sem pedido recente. */
    canais: CanalDoCartao[];
  } | null;
  numeros_30d: {
    vendas: number;
    vendido: number;
    com_origem: { anuncio: number; grupo: number };
    sem_origem: number;
    meta: ResumoBling["meta_30d"];
    pendentes: number;
    falhas: number;
  } | null;
  listas: ResumoBling["listas"] | null;
  ultimas: UltimaDoCartao[];
};

/** Instante de um timestamp do PostgREST; null quando não há ou não parseia. */
function instante(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * "parado" = a varredura achou venda depois do último aviso (ou nunca houve aviso): o Bling
 * desligou o webhook ou parou de avisar, e as vendas chegam só pela varredura de 5 min.
 */
export function tempoReal(c: Pick<ConexaoBling, "lastWebhookAt" | "lastScanChangeAt">, agora: Date): TempoReal {
  const aviso = instante(c.lastWebhookAt);
  if (aviso !== null && agora.getTime() - aviso <= SILENCIO_DO_AVISO_MS) return "ok";
  const mudanca = instante(c.lastScanChangeAt);
  return mudanca !== null && (aviso === null || mudanca > aviso) ? "parado" : "sem_dados";
}

export function ultimoErro(c: Pick<ConexaoBling, "status" | "lastError" | "lastErrorAt">, agora: Date): string | null {
  if (c.status === "reconectar") return c.lastError;
  const quando = instante(c.lastErrorAt);
  return quando !== null && agora.getTime() - quando <= VIDA_DO_ERRO_MS ? c.lastError : null;
}

/** Marca o que o motor conta como venda: a escolha da loja, ou o padrão calculado agora se ela nunca escolheu. */
export function situacoesDoCartao(c: Pick<ConexaoBling, "situations" | "saleSituationIds">): SituacaoDoCartao[] {
  const marcadas = new Set(idsDeVendaEfetivos(c.saleSituationIds, c.situations));
  return situacoesOuPadrao(c.situations).map((s) => {
    const bloqueada = BASES_BLOQUEADAS.has(s.base);
    // Bloqueada não conta nem se a lista guardada disser que sim: o motor (classificarPedido) também não conta.
    return { id: s.id, nome: s.nome, base: s.base, conta: !bloqueada && marcadas.has(s.id), bloqueada };
  });
}

/**
 * A versão das situações da conexão: sha256 do JSON da lista como está gravada, 16 hex. Pelo conteúdo, não pela hora
 * (`situations_at`): o motor relê a cada 24 h e grava a hora, e a mesma lista relida não pode recusar o Salvar.
 */
export function versaoDasSituacoes(situacoes: readonly SituacaoBling[]): string {
  return createHash("sha256").update(JSON.stringify(situacoes)).digest("hex").slice(0, 16);
}

/** Campanhas com pixel E token (as que enviam pelo servidor), sem o token, que não sai do servidor. */
export function opcoesDoPixel(campanhas: readonly CampaignGroup[]): OpcaoDePixel[] {
  const nomes = new Map(campanhas.map((c) => [c.id, c.name]));
  return opcoesDePixel(campanhas).map((o) => ({
    campaign_id: o.campaignId,
    campanha: nomes.get(o.campaignId) ?? "",
    pixel_id: o.pixelId,
  }));
}

export function ultimasVendas(
  linhas: readonly LinhaPedidoBling[],
  contatos: readonly ContatoGuardado[],
  situacoes: readonly SituacaoBling[],
): UltimaDoCartao[] {
  const porId = new Map(contatos.map((c) => [c.blingContactId, c]));
  const nomes = new Map(situacoes.map((s) => [s.id, s.nome]));
  return linhas.flatMap((l) => {
    if (l.kind !== "venda" && l.kind !== "pedido") return [];
    const contato = l.blingContactId === null ? undefined : porId.get(l.blingContactId);
    return [
      {
        // Pedido não tem hora de venda: vale quando chegou.
        hora: l.saleAt ?? l.firstSeenAt,
        cliente: contato?.name ?? null,
        telefone_mascarado: contato?.phone ? telefoneMascarado(contato.phone) : null,
        valor: l.total,
        tipo: l.kind,
        origem: l.origem,
        origem_detalhe: l.origemDetalhe,
        // A venda vai ao Meta como Purchase; o pedido, como InitiateCheckout.
        meta: l.kind === "venda" ? l.purchaseStatus : l.icStatus,
        situacao: l.situacaoId === null ? null : (nomes.get(l.situacaoId) ?? null),
      },
    ];
  });
}

type PedidosDoCanal = Pick<CanalDoCartao, "pedidos" | "exemplos" | "ultimo_pedido_em">;

/**
 * Um canal por `loja.id`. Primeiro os da conta, na ordem do Bling: os ativos sempre (a Yampi aparece antes do primeiro
 * pedido dela, e sai do Meta antes de duplicar), o desabilitado só com pedido ou fora do Meta. Depois os vistos só nos
 * pedidos (sem o escopo, ou apagados na conta), do pedido mais novo; por fim os fora do Meta sem nada disso, para dar
 * para devolvê-los ao envio. `daConta` null = sem o escopo de canais.
 */
export function canaisDoCartao(
  pedidos: readonly PedidoComCanal[],
  foraDoMeta: readonly number[],
  daConta: readonly CanalBling[] | null,
): CanalDoCartao[] {
  const vistos = pedidosPorCanal(pedidos);
  const conta = new Map((daConta ?? []).map((c) => [c.id, c]));
  const daContaQueAparecem = (daConta ?? []).filter((c) => c.ativo || vistos.has(c.id) || foraDoMeta.includes(c.id));
  const ids = new Set([...daContaQueAparecem.map((c) => c.id), ...vistos.keys(), ...foraDoMeta]);
  return [...ids].map((id) => {
    const c = conta.get(id);
    return {
      id,
      nome: c?.nome ?? null,
      tipo: c?.tipo ?? null,
      ativo: c?.ativo ?? true,
      ...(vistos.get(id) ?? { pedidos: 0, exemplos: [], ultimo_pedido_em: null }),
      fora_do_meta: foraDoMeta.includes(id),
    };
  });
}

/** Quantos pedidos, até 3 números e o dia do último, por canal, na ordem do pedido mais novo (os pedidos chegam assim). */
function pedidosPorCanal(pedidos: readonly PedidoComCanal[]): Map<number, PedidosDoCanal> {
  const canais = new Map<number, PedidosDoCanal>();
  for (const p of pedidos) {
    const canal = canais.get(p.lojaId) ?? { pedidos: 0, exemplos: [], ultimo_pedido_em: null };
    canais.set(p.lojaId, {
      pedidos: canal.pedidos + 1,
      exemplos: p.numero && canal.exemplos.length < EXEMPLOS_POR_CANAL ? [...canal.exemplos, p.numero] : canal.exemplos,
      ultimo_pedido_em: canal.ultimo_pedido_em ?? p.orderDate,
    });
  }
  return canais;
}

function numerosDoResumo(r: ResumoBling): NonNullable<CartaoBling["numeros_30d"]> {
  return {
    vendas: r.vendas_30d,
    vendido: r.vendido_30d,
    com_origem: { anuncio: r.origem_30d.anuncio, grupo: r.origem_30d.grupo },
    sem_origem: r.origem_30d.sem_origem,
    meta: { ...r.meta_30d },
    pendentes: r.pendentes,
    falhas: r.falhas,
  };
}

export type EntradaDoCartao = {
  conexao: ConexaoBling;
  resumo: ResumoBling;
  linhas: readonly LinhaPedidoBling[];
  contatos: readonly ContatoGuardado[];
  campanhas: readonly CampaignGroup[];
  canais: readonly PedidoComCanal[];
  agora: Date;
};

export function cartaoConectado(e: EntradaDoCartao): CartaoBling {
  const { conexao: c, resumo: r, agora } = e;
  const opcoes = opcoesDoPixel(e.campanhas);
  const pausa = instante(c.pausedUntil);
  return {
    disponivel: true,
    conexao: {
      status: c.status,
      empresa: c.companyName,
      conectada_em: c.connectedAt,
      ultima_venda_em: c.lastSaleAt,
      ultimo_aviso_em: c.lastWebhookAt,
      tempo_real: tempoReal(c, agora),
      // A pausa do disjuntor fica gravada depois de vencer: vencida não é pausa.
      pausada_ate: pausa !== null && pausa > agora.getTime() ? c.pausedUntil : null,
      ultimo_erro: ultimoErro(c, agora),
    },
    historico: { lidos: r.historico_lidos, concluido: c.backfillDoneAt !== null },
    ajustes: {
      situacoes: situacoesDoCartao(c),
      situacoes_versao: versaoDasSituacoes(c.situations),
      high_value: c.highValue,
      meta_enabled: c.metaEnabled,
      pixel: {
        // Só a escolha que ainda é opção: uma campanha que perdeu o token faria o "Salvar" voltar 400.
        escolhido: opcoes.some((o) => o.campaign_id === c.metaCampaignId) ? c.metaCampaignId : null,
        opcoes,
      },
      canais: canaisDoCartao(e.canais, c.metaSkipStoreIds, c.salesChannels),
    },
    numeros_30d: numerosDoResumo(r),
    listas: { ...r.listas },
    ultimas: ultimasVendas(e.linhas, e.contatos, situacoesOuPadrao(c.situations)),
  };
}

function cartaoVazio(disponivel: boolean): CartaoBling {
  return { disponivel, conexao: null, historico: null, ajustes: null, numeros_30d: null, listas: null, ultimas: [] };
}

export async function montarCartao(tenantId: string, agora: Date): Promise<CartaoBling> {
  // Sem as variáveis, nenhuma consulta: o cartão vai ao ar antes da DDL, quando as tabelas nem existem.
  if (!blingDisponivel()) return cartaoVazio(false);
  const conexao = await lerConexao(tenantId);
  if (!conexao || conexao.status === "desconectada") return cartaoVazio(true);

  const [resumo, linhas, campanhas, canais] = await Promise.all([
    lerResumo(tenantId),
    ultimasDoCartao(tenantId, ULTIMAS),
    listCampaignGroups(tenantId),
    // Falhar aqui não derruba o cartão: os canais fora do Meta seguem nele (`canaisDoCartao`), sem os sem marca.
    pedidosComCanal(tenantId, PEDIDOS_DOS_CANAIS).catch((e: unknown) => {
      console.warn(`[bling/cartao] ${tenantId}: canais de venda: ${(e as Error).message}`);
      return [];
    }),
  ]);
  const ids = [...new Set(linhas.flatMap((l) => (l.blingContactId === null ? [] : [l.blingContactId])))];
  const contatos = await lerContatosPorIds(tenantId, ids);
  return cartaoConectado({ conexao, resumo, linhas, contatos, campanhas, canais, agora });
}
