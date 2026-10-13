import "server-only";

import { z } from "zod";

import { idsDeVendaPadrao } from "@/lib/bling/classificar";
import type { SituacaoBling } from "@/lib/bling/tipos";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Conexão de uma loja com o Bling (spec §2 e §3). Tokens só entram e saem cifrados
 * (`lib/security/secret-box`, contexto em `contextoDoToken`) e só por `salvarConexao` e
 * `salvarTokensRenovados`. `token_version` é a trava otimista do refresh token, que
 * rotaciona: toda gravação de token confere a versão lida.
 */

const TABLE = "bling_connections";
const UNIQUE_VIOLATION = "23505";
/** A janela de venda do funil (spec §1): o histórico importado ao conectar. */
const DIAS_DE_HISTORICO = 90;
const UM_DIA_MS = 86_400_000;
/** Perder a corrida da versão três vezes seguidas não é corrida, é defeito: estoura. */
const TENTATIVAS = 3;

/** AAD dos tokens no secret-box: a cifra de uma loja, ou do outro token, não abre no lugar desta. */
export function contextoDoToken(tenantId: string, campo: "access" | "refresh"): string {
  return `bling:${tenantId}:${campo}`;
}

export type StatusConexao = "ativa" | "reconectar" | "desconectada";

export type ConexaoBling = {
  tenantId: string;
  companyId: string | null;
  companyName: string | null;
  status: StatusConexao;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  accessExpiresAt: string | null;
  tokenVersion: number;
  situations: SituacaoBling[];
  situationsAt: string | null;
  saleSituationIds: number[];
  highValue: number | null;
  metaEnabled: boolean;
  metaCampaignId: string | null;
  backfillFrom: string | null;
  backfillUntil: string | null;
  backfillPage: number;
  backfillDoneAt: string | null;
  scanCursor: string | null;
  pausedUntil: string | null;
  consecutiveFailures: number;
  lastWebhookAt: string | null;
  lastScanAt: string | null;
  lastScanChangeAt: string | null;
  lastSaleAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  reconnectAlertedAt: string | null;
  connectedAt: string;
};

// As colunas do tipo, nada além: trava e quem conectou não saem daqui. Um literal só: o
// supabase-js tipa o select pelo texto, e concatenação vira `string`.
const COLS =
  "tenant_id, company_id, company_name, status, access_token_enc, refresh_token_enc, access_expires_at, token_version, situations, situations_at, sale_situation_ids, high_value, meta_enabled, meta_campaign_id, backfill_from, backfill_until, backfill_page, backfill_done_at, scan_cursor, paused_until, consecutive_failures, last_webhook_at, last_scan_at, last_scan_change_at, last_sale_at, last_error, last_error_at, reconnect_alerted_at, connected_at";

/** numeric e bigint podem chegar como texto do PostgREST. */
type Numero = number | string;

type Linha = {
  tenant_id: string;
  company_id: string | null;
  company_name: string | null;
  status: StatusConexao;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  access_expires_at: string | null;
  token_version: Numero;
  situations: unknown;
  situations_at: string | null;
  sale_situation_ids: Numero[] | null;
  high_value: Numero | null;
  meta_enabled: boolean;
  meta_campaign_id: string | null;
  backfill_from: string | null;
  backfill_until: string | null;
  backfill_page: Numero;
  backfill_done_at: string | null;
  scan_cursor: string | null;
  paused_until: string | null;
  consecutive_failures: Numero;
  last_webhook_at: string | null;
  last_scan_at: string | null;
  last_scan_change_at: string | null;
  last_sale_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  reconnect_alerted_at: string | null;
  connected_at: string;
};

const situacoesSchema = z.array(z.object({ id: z.number(), nome: z.string(), base: z.number() }));

/** Só nós gravamos o jsonb, mas ele não pode derrubar a leitura: torto vira lista vazia. */
function lerSituacoes(valor: unknown): SituacaoBling[] {
  const lidas = situacoesSchema.safeParse(valor);
  return lidas.success ? lidas.data : [];
}

function numeroOuNulo(valor: Numero | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function paraConexao(l: Linha): ConexaoBling {
  return {
    tenantId: l.tenant_id,
    companyId: l.company_id,
    companyName: l.company_name,
    status: l.status,
    accessTokenEnc: l.access_token_enc,
    refreshTokenEnc: l.refresh_token_enc,
    accessExpiresAt: l.access_expires_at,
    tokenVersion: Number(l.token_version),
    situations: lerSituacoes(l.situations),
    situationsAt: l.situations_at,
    saleSituationIds: (l.sale_situation_ids ?? []).map(Number).filter(Number.isSafeInteger),
    highValue: numeroOuNulo(l.high_value),
    metaEnabled: l.meta_enabled,
    metaCampaignId: l.meta_campaign_id,
    backfillFrom: l.backfill_from,
    backfillUntil: l.backfill_until,
    backfillPage: Number(l.backfill_page),
    backfillDoneAt: l.backfill_done_at,
    scanCursor: l.scan_cursor,
    pausedUntil: l.paused_until,
    consecutiveFailures: Number(l.consecutive_failures),
    lastWebhookAt: l.last_webhook_at,
    lastScanAt: l.last_scan_at,
    lastScanChangeAt: l.last_scan_change_at,
    lastSaleAt: l.last_sale_at,
    lastError: l.last_error,
    lastErrorAt: l.last_error_at,
    reconnectAlertedAt: l.reconnect_alerted_at,
    connectedAt: l.connected_at,
  };
}

async function lerUma(coluna: "tenant_id" | "company_id", valor: string): Promise<ConexaoBling | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select(COLS).eq(coluna, valor).limit(1);
  if (error) throw new Error(error.message);
  const linha = (data as Linha[] | null)?.[0];
  return linha ? paraConexao(linha) : null;
}

export function lerConexao(tenantId: string): Promise<ConexaoBling | null> {
  return lerUma("tenant_id", tenantId);
}

/**
 * Única leitura sem `.eq("tenant_id")`, e de propósito: é o id da empresa no Bling (aviso,
 * retorno do OAuth) que descobre a loja. `company_id` é único; o `tenantId` devolvido filtra o resto.
 */
export function lerConexaoPorEmpresa(companyId: string): Promise<ConexaoBling | null> {
  return lerUma("company_id", companyId);
}

/**
 * Para o cron, que passa por todas as lojas: sem filtro de loja de propósito, e só id e
 * histórico saem daqui. Quem varreu há mais tempo vai primeiro.
 * ponytail: o PostgREST corta em 1000 linhas; paginar quando houver mais de 1000 lojas no Bling.
 */
export async function listarConexoesParaSincronizar(agora: Date): Promise<Array<{ tenantId: string; historicoPendente: boolean }>> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("tenant_id, backfill_done_at")
    .eq("status", "ativa")
    .or(`paused_until.is.null,paused_until.lte.${agora.toISOString()}`)
    .order("last_scan_at", { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ tenant_id: string; backfill_done_at: string | null }>).map((l) => ({
    tenantId: l.tenant_id,
    historicoPendente: l.backfill_done_at === null,
  }));
}

export type DadosDaConexao = {
  companyId: string;
  companyName: string | null;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessExpiresAt: Date;
  situations: SituacaoBling[];
  connectedBy: string;
  /** `YYYY-MM-DD` em São Paulo: o histórico vai de hoje − 90 dias até hoje. */
  hoje: string;
};

/**
 * Nova → insere com os padrões. Existente → troca tokens e empresa, volta a `ativa`, sobe a
 * versão, zera falhas, alerta e trava; mantém os ajustes da loja (valor alto, Meta, situações
 * de venda já escolhidas) e só reabre o histórico se ele nunca terminou.
 */
export async function salvarConexao(tenantId: string, d: DadosDaConexao): Promise<void> {
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
    const atual = await lerConexao(tenantId);
    const gravou = atual ? await reconectar(atual, d) : await inserir(tenantId, d);
    if (gravou) return;
  }
  throw new Error("bling_connections: a conexão mudou durante a gravação");
}

/** O que a conexão nova e a reconexão gravam igual: empresa, tokens, situações e tudo zerado. */
function camposDaConexao(d: DadosDaConexao, agora: string) {
  return {
    company_id: d.companyId,
    company_name: d.companyName,
    status: "ativa",
    access_token_enc: d.accessTokenEnc,
    refresh_token_enc: d.refreshTokenEnc,
    access_expires_at: d.accessExpiresAt.toISOString(),
    situations: d.situations,
    situations_at: agora,
    consecutive_failures: 0,
    paused_until: null,
    last_error: null,
    last_error_at: null,
    reconnect_alerted_at: null,
    lease_holder: null,
    lease_until: null,
    connected_by: d.connectedBy,
    connected_at: agora,
    updated_at: agora,
  };
}

function historicoAberto(hoje: string) {
  // Meio-dia UTC: subtrair dias inteiros nunca troca a data por causa de fuso.
  const desde = new Date(Date.parse(`${hoje}T12:00:00Z`) - DIAS_DE_HISTORICO * UM_DIA_MS);
  return { backfill_from: desde.toISOString().slice(0, 10), backfill_until: hoje, backfill_page: 1, backfill_done_at: null };
}

/** false = a linha da loja nasceu entre a leitura e o insert: a próxima volta atualiza. */
async function inserir(tenantId: string, d: DadosDaConexao): Promise<boolean> {
  const agora = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      ...camposDaConexao(d, agora),
      token_version: 1,
      sale_situation_ids: idsDeVendaPadrao(d.situations),
      ...historicoAberto(d.hoje),
      scan_cursor: agora,
    });
  if (!error) return true;
  // Conflito no company_id não se resolve tentando de novo: a conta do Bling é de outra loja.
  const daLoja = error.code === UNIQUE_VIOLATION && !`${error.message} ${error.details ?? ""}`.includes("company_id");
  if (daLoja) return false;
  throw new Error(error.message);
}

/** false = a versão mudou entre a leitura e a gravação (renovação em voo): relê e tenta de novo. */
async function reconectar(atual: ConexaoBling, d: DadosDaConexao): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      ...camposDaConexao(d, new Date().toISOString()),
      token_version: atual.tokenVersion + 1,
      // A escolha da loja vale mais que o padrão: só preenche se ela nunca escolheu.
      ...(atual.saleSituationIds.length === 0 ? { sale_situation_ids: idsDeVendaPadrao(d.situations) } : {}),
      // Histórico terminado não volta: reconectar não reimporta 90 dias.
      ...(atual.backfillDoneAt === null ? historicoAberto(d.hoje) : {}),
    })
    .eq("tenant_id", atual.tenantId)
    .eq("token_version", atual.tokenVersion)
    .select("tenant_id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

/** false = outro processo renovou antes (a versão não é mais a lida): releia e siga com o dele. */
export async function salvarTokensRenovados(
  tenantId: string,
  versaoLida: number,
  t: { accessTokenEnc: string; refreshTokenEnc: string; accessExpiresAt: Date },
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      access_token_enc: t.accessTokenEnc,
      refresh_token_enc: t.refreshTokenEnc,
      access_expires_at: t.accessExpiresAt.toISOString(),
      token_version: versaoLida + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("token_version", versaoLida)
    .select("tenant_id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

/** Só conexão ativa vira `reconectar`: uma que a loja desligou no meio da execução fica desligada. */
export async function marcarReconectar(tenantId: string, erro: string): Promise<void> {
  const agora = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status: "reconectar", last_error: erro, last_error_at: agora, lease_holder: null, lease_until: null, updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("status", "ativa");
  if (error) throw new Error(error.message);
}

/** true só na primeira vez: o e-mail de reconectar sai uma vez por queda, não a cada cron. */
export async function marcarAlertaReconectar(tenantId: string): Promise<boolean> {
  const agora = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ reconnect_alerted_at: agora, updated_at: agora })
    .eq("tenant_id", tenantId)
    .is("reconnect_alerted_at", null)
    .select("tenant_id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

/** Campos operacionais e de ajuste. Token nunca: só por `salvarConexao`/`salvarTokensRenovados`. */
export type AtualizacaoConexao = Partial<{
  situations: SituacaoBling[];
  situations_at: string | null;
  sale_situation_ids: number[];
  high_value: number | null;
  meta_enabled: boolean;
  meta_campaign_id: string | null;
  backfill_page: number;
  backfill_done_at: string | null;
  scan_cursor: string | null;
  paused_until: string | null;
  consecutive_failures: number;
  last_webhook_at: string | null;
  last_scan_at: string | null;
  last_scan_change_at: string | null;
  last_sale_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
}>;

export async function atualizarConexao(tenantId: string, campos: AtualizacaoConexao): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

/**
 * Devolve a conexão de antes (quem chama revoga o refresh dela no Bling). Pedidos, contatos e
 * vendas importadas ficam. A versão sobe para a renovação em voo perder a corrida e não
 * devolver token a uma loja que pediu para desconectar.
 */
export async function desconectarConexao(tenantId: string): Promise<ConexaoBling | null> {
  const anterior = await lerConexao(tenantId);
  if (!anterior) return null;
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "desconectada",
      company_id: null,
      access_token_enc: null,
      refresh_token_enc: null,
      access_expires_at: null,
      token_version: anterior.tokenVersion + 1,
      lease_holder: null,
      lease_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return anterior;
}

/** Trava da loja no relógio do banco (`bling_claim`): um processador por vez. */
export async function pegarTrava(tenantId: string, dono: string, segundos: number): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("bling_claim", { p_tenant: tenantId, p_holder: dono, p_seconds: segundos });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function soltarTrava(tenantId: string, dono: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("bling_release", { p_tenant: tenantId, p_holder: dono });
  if (error) throw new Error(error.message);
}
