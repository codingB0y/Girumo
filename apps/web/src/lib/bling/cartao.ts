import "server-only";

import { createHash } from "node:crypto";

import { BASES_BLOQUEADAS, idsDeVendaEfetivos, situacoesOuPadrao } from "@/lib/bling/classificar";
import { blingDisponivel } from "@/lib/bling/deps";
import { opcoesDePixel } from "@/lib/bling/eventos-meta";
import type { SituacaoBling } from "@/lib/bling/tipos";
import { telefoneMascarado } from "@/lib/pages/phone";
import { lerConexao, type ConexaoBling, type StatusConexao } from "@/lib/stores/bling-conexoes";
import { lerContatosPorIds, type ContatoGuardado } from "@/lib/stores/bling-contatos";
import {
  lerResumo,
  ultimasDoCartao,
  type LinhaPedidoBling,
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
const HORA_MS = 3_600_000;
/** Sem aviso há mais que isso e a varredura achando venda: o Bling parou de avisar. */
const SILENCIO_DO_AVISO_MS = 6 * HORA_MS;
/** Erro de execução some do cartão depois de um dia; o de acesso recusado fica até reconectar. */
const VIDA_DO_ERRO_MS = 24 * HORA_MS;

export type TempoReal = "ok" | "parado" | "sem_dados";
export type SituacaoDoCartao = { id: number; nome: string; base: number; conta: boolean; bloqueada: boolean };
export type OpcaoDePixel = { campaign_id: string; campanha: string; pixel_id: string };

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

  const [resumo, linhas, campanhas] = await Promise.all([
    lerResumo(tenantId),
    ultimasDoCartao(tenantId, ULTIMAS),
    listCampaignGroups(tenantId),
  ]);
  const ids = [...new Set(linhas.flatMap((l) => (l.blingContactId === null ? [] : [l.blingContactId])))];
  const contatos = await lerContatosPorIds(tenantId, ids);
  return cartaoConectado({ conexao, resumo, linhas, contatos, campanhas, agora });
}
