import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { EVENTOS_YAMPI, type ConexaoYampi, type StatusYampi } from "@/lib/yampi/tipos";

/**
 * `yampi_connections` (PR 1a): uma por loja, a mesma para o Rastreio e o Recuperar. Credencial e segredo do aviso
 * entram e saem selados (`lib/yampi/credenciais`). Service-role: o filtro de loja é a proteção, não o RLS.
 */

const TABLE = "yampi_connections";
const COLS =
  "id, tenant_id, alias, user_token, user_secret_key, webhook_id, webhook_secret, status, last_event_at, last_check_at, last_error";

type Linha = {
  id: string;
  tenant_id: string;
  alias: string;
  user_token: string | null;
  user_secret_key: string | null;
  webhook_id: string | null;
  webhook_secret: string | null;
  status: StatusYampi;
  last_event_at: string | null;
  last_check_at: string | null;
  last_error: string | null;
};

function paraConexao(l: Linha): ConexaoYampi {
  return {
    id: l.id,
    tenantId: l.tenant_id,
    alias: l.alias,
    status: l.status,
    userTokenSelado: l.user_token,
    userSecretKeySelado: l.user_secret_key,
    webhookId: l.webhook_id,
    webhookSecretSelado: l.webhook_secret,
    lastEventAt: l.last_event_at,
    lastCheckAt: l.last_check_at,
    lastError: l.last_error,
  };
}

async function lerUma(coluna: "tenant_id" | "id", valor: string): Promise<ConexaoYampi | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select(COLS).eq(coluna, valor).limit(1);
  if (error) throw new Error(error.message);
  const linha = (data as Linha[] | null)?.[0];
  return linha ? paraConexao(linha) : null;
}

export function lerConexaoYampi(tenantId: string): Promise<ConexaoYampi | null> {
  return lerUma("tenant_id", tenantId);
}

/**
 * Sem `.eq("tenant_id")`, de propósito: o aviso só traz o `?c=<id>`, e a loja vem da linha. O `tenantId`
 * devolvido filtra todo o resto.
 */
export function lerConexaoYampiPorId(id: string): Promise<ConexaoYampi | null> {
  return lerUma("id", id);
}

/** Conectar (ou reconectar): credencial nova, aviso por criar. O id da linha não muda ao reconectar. */
export async function salvarConexaoYampi(
  tenantId: string,
  d: { alias: string; userTokenSelado: string; userSecretKeySelado: string },
): Promise<ConexaoYampi> {
  const linha = {
    tenant_id: tenantId,
    alias: d.alias,
    user_token: d.userTokenSelado,
    user_secret_key: d.userSecretKeySelado,
    status: "aviso_desativado" satisfies StatusYampi,
    webhook_id: null,
    webhook_secret: null,
    last_error: null,
    last_check_at: null,
  };
  const { data, error } = await getSupabaseAdmin().from(TABLE).upsert(linha, { onConflict: "tenant_id" }).select(COLS);
  if (error) throw new Error(error.message);
  const salva = (data as Linha[] | null)?.[0];
  if (!salva) throw new Error("Yampi: a conexão não foi gravada");
  return paraConexao(salva);
}

export type PatchConexaoYampi = Partial<{
  status: StatusYampi;
  last_error: string | null;
  last_check_at: string | null;
  last_event_at: string | null;
}>;

export async function atualizarConexaoYampi(tenantId: string, patch: PatchConexaoYampi): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).update(patch).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

const VIVAS: StatusYampi[] = ["ativa", "aviso_desativado"];

/**
 * Grava só se a linha ainda é a conexão que quem chama leu: o mesmo token selado (cada selagem tem IV novo, então
 * ele serve de versão) e ainda viva. Assim uma chamada lenta à Yampi não desfaz a desconexão, a troca de token ou o
 * 401 que aconteceram no meio dela. true = gravou.
 */
export async function atualizarMesmaConexaoYampi(
  tenantId: string,
  userTokenSelado: string | null,
  patch: PatchConexaoYampi & { webhook_id?: string; webhook_secret?: string; events?: string[] },
): Promise<boolean> {
  if (!userTokenSelado) return false;
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("user_token", userTokenSelado)
    .in("status", VIVAS)
    .select("tenant_id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** O aviso criado na Yampi: id e segredo selado. A conexão volta a `ativa`. false = a conexão mudou no meio. */
export function salvarAvisoYampi(
  tenantId: string,
  userTokenSelado: string | null,
  a: { webhookId: string; webhookSecretSelado: string },
): Promise<boolean> {
  return atualizarMesmaConexaoYampi(tenantId, userTokenSelado, {
    webhook_id: a.webhookId,
    webhook_secret: a.webhookSecretSelado,
    events: [...EVENTOS_YAMPI],
    status: "ativa",
    last_error: null,
    last_check_at: new Date().toISOString(),
  });
}

/** Só a conexão viva com aquele token muda: o sino avisa uma vez, e o 401 de um token velho não derruba o novo. */
export function marcarCredencialInvalidaNoBanco(tenantId: string, userTokenSelado: string | null, erro: string): Promise<boolean> {
  return atualizarMesmaConexaoYampi(tenantId, userTokenSelado, { status: "credencial_invalida", last_error: erro });
}

/** Apaga credencial e aviso e mantém a linha (o id, e a URL do aviso, sobrevivem). Devolve a conexão de antes. */
export async function desconectarConexaoYampi(tenantId: string): Promise<ConexaoYampi | null> {
  const antes = await lerConexaoYampi(tenantId);
  if (!antes) return null;
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "desconectada" satisfies StatusYampi,
      user_token: null,
      user_secret_key: null,
      webhook_id: null,
      webhook_secret: null,
    })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return antes;
}

/**
 * Sem filtro de loja, de propósito: é o cron que descobre quem conferir. Ativas ou com o aviso caído, sem
 * checagem desde `antesDe`, as mais antigas primeiro.
 */
export async function listarConexoesParaConferir(antesDe: Date, limite: number): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("tenant_id")
    .in("status", ["ativa", "aviso_desativado"])
    .or(`last_check_at.is.null,last_check_at.lt.${antesDe.toISOString()}`)
    .order("last_check_at", { ascending: true, nullsFirst: true })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data as Array<{ tenant_id: string }> | null) ?? []).map((l) => l.tenant_id);
}
