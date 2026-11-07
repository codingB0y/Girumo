import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Conexão OAuth da loja com o Melhor Envio (`melhorenvio_connections`, uma por loja). Service-role: o filtro
 * `tenant_id` de toda query é a proteção real. Os tokens só passam por aqui selados (secret-box); quem abre
 * e sela é a passada. Nada de token em log.
 */

const TABLE = "melhorenvio_connections";
const CODIGO_DE_ERRO = /^[a-z0-9_]{1,40}$/;

/** `last_error` vai para a tela: só código curto; corpo do Melhor Envio ou `String(err)` viram "erro". */
const codigoSeguro = (erro: string | null): string | null => (erro === null || CODIGO_DE_ERRO.test(erro) ? erro : "erro");

export type ConexaoMelhorEnvio = {
  tenantId: string;
  status: "ativa" | "reautorizar";
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiraEm: string;
  renovacaoExpiraEm: string;
  contaNome: string | null;
  contaEmail: string | null;
  temEtiqueta: boolean | null;
  primeiraPassadaEm: string | null;
  ultimaConsultaEm: string | null;
  ultimoErro: string | null;
};

type Linha = {
  tenant_id: string;
  status: "ativa" | "reautorizar";
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string;
  refresh_expires_at: string;
  account_name: string | null;
  account_email: string | null;
  has_labels: boolean | null;
  first_pass_at: string | null;
  last_check_at: string | null;
  last_error: string | null;
};

type NovosTokens = { accessTokenEnc: string; refreshTokenEnc: string; expiraEm: Date; renovacaoExpiraEm: Date };

/** O contexto (AAD) do selo: o token de uma loja não abre como o de outra, nem o access como o refresh. */
export const contextoDoTokenMe = (tenantId: string, campo: "access" | "refresh"): string => `melhorenvio:${tenantId}:${campo}`;

function paraConexao(l: Linha): ConexaoMelhorEnvio {
  return {
    tenantId: l.tenant_id,
    status: l.status,
    accessTokenEnc: l.access_token_enc,
    refreshTokenEnc: l.refresh_token_enc,
    expiraEm: l.expires_at,
    renovacaoExpiraEm: l.refresh_expires_at,
    contaNome: l.account_name,
    contaEmail: l.account_email,
    temEtiqueta: l.has_labels,
    primeiraPassadaEm: l.first_pass_at,
    ultimaConsultaEm: l.last_check_at,
    ultimoErro: l.last_error,
  };
}

export async function lerConexao(tenantId: string): Promise<ConexaoMelhorEnvio | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? paraConexao(data as unknown as Linha) : null;
}

/** Conectar e reconectar: reconectar zera a passada (primeira passada de novo, sem aviso). */
export async function salvarConexao(
  tenantId: string,
  c: NovosTokens & { contaNome: string; contaEmail: string; temEtiqueta: boolean | null; conectadaPor: string },
): Promise<void> {
  // ponytail: sem key_fp (o Bling grava a impressão da chave): trocar a INTEGRATIONS_ENCRYPTION_KEY faz a passada lançar em `abrir` até a loja reconectar; acrescentar quando a chave for trocada.
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        tenant_id: tenantId,
        status: "ativa",
        access_token_enc: c.accessTokenEnc,
        refresh_token_enc: c.refreshTokenEnc,
        expires_at: c.expiraEm.toISOString(),
        refresh_expires_at: c.renovacaoExpiraEm.toISOString(),
        account_name: c.contaNome,
        account_email: c.contaEmail,
        has_labels: c.temEtiqueta,
        first_pass_at: null,
        last_check_at: null,
        last_error: null,
        connected_by: c.conectadaPor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
  if (error) throw new Error(error.message);
}

/**
 * A trava da passada: update condicional em `last_check_at`. Duas execuções do cron ao mesmo tempo, só uma
 * recebe a linha; a outra recebe `null` e pula a loja.
 */
export async function reivindicarPassada(tenantId: string, agora: Date, intervaloMs: number): Promise<ConexaoMelhorEnvio | null> {
  const limite = new Date(agora.getTime() - intervaloMs).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ last_check_at: agora.toISOString() })
    .eq("tenant_id", tenantId)
    .eq("status", "ativa")
    .or(`last_check_at.is.null,last_check_at.lt.${limite}`)
    .select();
  if (error) throw new Error(error.message);
  const linha = (data as unknown as Linha[] | null)?.[0];
  return linha ? paraConexao(linha) : null;
}

/**
 * Grava o par renovado. O refresh token roda a cada renovação: a gravação só vale se o refresh selado ainda
 * é o que foi lido. `false` = outra gravação ganhou (a lojista reconectou no meio).
 */
export async function trocarTokens(tenantId: string, refreshLido: string, novo: NovosTokens): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      access_token_enc: novo.accessTokenEnc,
      refresh_token_enc: novo.refreshTokenEnc,
      expires_at: novo.expiraEm.toISOString(),
      refresh_expires_at: novo.renovacaoExpiraEm.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("refresh_token_enc", refreshLido)
    .select("tenant_id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * `true` só na transição ativa → reautorizar (é ela que dispara o sininho, uma vez). Condicional ao refresh
 * lido, como `trocarTokens`: passada velha não derruba conexão recém-reconectada.
 */
export async function marcarReautorizar(tenantId: string, refreshLido: string, erro: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status: "reautorizar", last_error: codigoSeguro(erro) })
    .eq("tenant_id", tenantId)
    .eq("status", "ativa")
    .eq("refresh_token_enc", refreshLido)
    .select("tenant_id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * `r.agora` tem de ser o mesmo `agora` que `reivindicarPassada` gravou em `last_check_at`: o filtro por ele faz
 * a passada velha (que terminou depois de uma reconexão) não escrever na conexão nova.
 */
export async function concluirPassada(
  tenantId: string,
  r: { agora: Date; primeiraPassada: boolean; temEtiqueta: boolean | null; erro: string | null },
): Promise<void> {
  const campos: Record<string, unknown> = { last_error: codigoSeguro(r.erro) };
  if (r.primeiraPassada && r.erro === null) campos.first_pass_at = r.agora.toISOString();
  if (r.temEtiqueta !== null) campos.has_labels = r.temEtiqueta;
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(campos)
    .eq("tenant_id", tenantId)
    .eq("last_check_at", r.agora.toISOString());
  if (error) throw new Error(error.message);
}

export async function apagarConexao(tenantId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}
