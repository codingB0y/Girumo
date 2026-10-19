import "server-only";

import type { SituacaoBling } from "@/lib/bling/tipos";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { lerConexao, type ConexaoBling } from "./bling-conexoes";

/**
 * O que o retorno do OAuth grava (spec §3 "Conectar"): a conexão nova, ou a reconexão da mesma
 * loja. A leitura e o resto da conexão estão em `bling-conexoes.ts`.
 */

const TABLE = "bling_connections";
const UNIQUE_VIOLATION = "23505";
/** A janela de venda do funil (spec §1): o histórico importado ao conectar. */
const DIAS_DE_HISTORICO = 90;
const UM_DIA_MS = 86_400_000;
/** Perder a corrida da versão três vezes seguidas não é corrida, é defeito: estoura. */
const TENTATIVAS = 3;

export type DadosDaConexao = {
  companyId: string;
  companyName: string | null;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessExpiresAt: Date;
  /** As situações da conta; vazia = não carregaram (o motor relê na primeira execução; a reconexão fica com as que tinha). */
  situations: SituacaoBling[];
  connectedBy: string;
  /** `YYYY-MM-DD` em São Paulo: o histórico vai de hoje − 90 dias até hoje. */
  hoje: string;
  /** Impressão da chave que selou os tokens (`impressaoDaChave`). */
  keyFp: string;
};

/**
 * Nova → insere com os padrões. Existente → troca tokens e empresa, volta a `ativa`, sobe a
 * versão, zera falhas, alerta e recuo da renovação; mantém os ajustes da loja (valor alto, Meta,
 * situações de venda) e só reabre o histórico se ele nunca terminou. As situações de venda nunca
 * são preenchidas aqui: vazio = a loja nunca escolheu, e o motor calcula o padrão na hora sobre as
 * situações atuais (gravar o padrão deixaria de fora uma filha de Atendido criada depois). As
 * situações da conta que não carregaram no retorno não apagam as que a conexão já tinha: só a hora
 * volta a nulo (o motor relê). A trava fica: soltá-la deixaria outra execução começar junto com a
 * que está rodando, que adota o par novo no lote seguinte.
 */
export async function salvarConexao(tenantId: string, d: DadosDaConexao): Promise<void> {
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
    const atual = await lerConexao(tenantId);
    const gravou = atual ? await reconectar(atual, d) : await inserir(tenantId, d);
    if (gravou) return;
  }
  throw new Error("bling_connections: a conexão mudou durante a gravação");
}

/**
 * As situações lidas no retorno, com a hora. Não carregaram: só a hora vai a nulo (o motor relê na primeira
 * execução), e a lista que a reconexão já tinha fica — sem ela, o cartão mostraria só as padrão e o Salvar
 * seguinte desmarcaria as filhas de Atendido da loja.
 */
function situacoesLidas(d: DadosDaConexao, agora: string) {
  return d.situations.length > 0 ? { situations: d.situations, situations_at: agora } : { situations_at: null };
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
    key_fp: d.keyFp,
    token_retry_at: null,
    ...situacoesLidas(d, agora),
    // O motor relê os canais na primeira execução: a reconexão pode ter trazido o escopo deles.
    sales_channels_at: null,
    consecutive_failures: 0,
    paused_until: null,
    last_error: null,
    last_error_at: null,
    reconnect_alerted_at: null,
    connected_by: d.connectedBy,
    connected_at: agora,
    updated_at: agora,
  };
}

function historicoAberto(hoje: string) {
  // Meio-dia UTC: subtrair dias inteiros nunca troca a data por causa de fuso.
  const desde = new Date(Date.parse(`${hoje}T12:00:00Z`) - DIAS_DE_HISTORICO * UM_DIA_MS);
  // As falhas seguidas eram da página de antes: o histórico reaberto começa da 1 sem nenhuma.
  return { backfill_from: desde.toISOString().slice(0, 10), backfill_until: hoje, backfill_page: 1, backfill_fails: 0, backfill_done_at: null };
}

/** false = a linha da loja nasceu entre a leitura e o insert: a próxima volta atualiza. */
async function inserir(tenantId: string, d: DadosDaConexao): Promise<boolean> {
  const agora = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      // Conexão nova sem as situações lidas: lista vazia (o motor relê na primeira execução).
      situations: [],
      ...camposDaConexao(d, agora),
      token_version: 1,
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
      // Histórico terminado não volta: reconectar não reimporta 90 dias.
      ...(atual.backfillDoneAt === null ? historicoAberto(d.hoje) : {}),
    })
    .eq("tenant_id", atual.tenantId)
    .eq("token_version", atual.tokenVersion)
    .select("tenant_id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}
