import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { hasPermission, type TenantRole } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { chaveDeIntegracoes, selar } from "@/lib/security/secret-box";
import { hashDoEstado } from "@/lib/stores/bling-oauth-states";
import { contextoDoTokenMe, salvarConexao } from "@/lib/stores/melhorenvio-conexoes";
import { consumirEstadoOAuthMe, cookieDoEstadoMe, criarEstadoOAuthMe } from "@/lib/stores/melhorenvio-oauth-states";
import { rastreioLigado } from "@/lib/stores/rastreio-config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { contaDoToken, ErroMelhorEnvio, paginaDeEtiquetas } from "./api";
import { credenciaisMelhorEnvio, ErroOAuthMelhorEnvio, trocarCodigo, urlDeAutorizacao } from "./oauth";

/**
 * Começar e concluir o OAuth do Melhor Envio (molde: `api/integracoes/bling/{conectar,retorno}`). As rotas
 * são finas; a regra mora aqui, com as dependências injetáveis. Nada de token, code, state, cookie ou dado
 * da conta em log ou resposta.
 */

export type MotivoDoRetorno = "conectado" | "conta_vazia" | "recusado" | "sessao" | "erro" | "indisponivel";

/** Entre o clique e o retorno vem o login no Melhor Envio: 10 min, como o do Bling. */
const VALIDADE_S = 600;

/** Mesmo corpo de `RASTREIO_DISABLED` (lib/rastreio/rota-painel); aqui literal para não puxar o contexto de rota (next/headers) para a lib. */
const RASTREIO_DESLIGADO = { error: "O Rastreio de pedidos não está liberado para esta loja.", code: "rastreio_disabled" };

/** Entre o clique e o retorno a pessoa pode ter perdido o papel ou saído da loja. */
async function papelNaLoja(tenantId: string, userId: string): Promise<TenantRole | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data as Array<{ role: TenantRole }> | null)?.[0]?.role ?? null;
}

export const DEPS = {
  credenciais: credenciaisMelhorEnvio,
  chave: chaveDeIntegracoes,
  ligado: rastreioLigado,
  // Também limita os states vivos por loja: 10 por janela de 10 min, que é a validade do state.
  limite: (tenantId: string): Promise<boolean> => checkRateLimit(`melhorenvio-conectar:${tenantId}`, 10, 600_000),
  criarEstado: criarEstadoOAuthMe,
  consumirEstado: consumirEstadoOAuthMe,
  papel: papelNaLoja,
  trocar: trocarCodigo,
  conta: contaDoToken,
  primeiraPagina: (token: string) => paginaDeEtiquetas(token, 1),
  salvar: salvarConexao,
  agora: () => new Date(),
};
export type DepsConexao = typeof DEPS;

type Resposta = { status: number; corpo: unknown; cookie?: string };

export async function iniciarConexao(ctx: { tenantId: string; userId: string }, deps: DepsConexao = DEPS): Promise<Resposta> {
  if (!(await deps.ligado(ctx.tenantId))) return { status: 403, corpo: RASTREIO_DESLIGADO };
  const credenciais = deps.credenciais();
  if (!credenciais || !deps.chave()) return { status: 503, corpo: { error: "indisponivel" } };
  if (await deps.limite(ctx.tenantId)) {
    return { status: 429, corpo: { error: "Muitas tentativas. Tente de novo em alguns minutos." } };
  }

  const state = randomBytes(32).toString("base64url");
  await deps.criarEstado({
    stateHash: hashDoEstado(state),
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    expiraEm: new Date(deps.agora().getTime() + VALIDADE_S * 1000),
  });
  return { status: 200, corpo: { url: urlDeAutorizacao(credenciais.clientId, state) }, cookie: cookieDoEstadoMe(state, VALIDADE_S) };
}

/**
 * Ordem do retorno do Bling: env → error → state+cookie → papel → code → troca → /me → primeira página →
 * salvar. Token que não chega a ser gravado é só descartado.
 */
export async function concluirRetorno(url: URL, cookie: string | null, deps: DepsConexao = DEPS): Promise<MotivoDoRetorno> {
  const credenciais = deps.credenciais();
  const chave = deps.chave();
  if (!credenciais || !chave) return "indisponivel";
  const params = url.searchParams;
  if (params.has("error")) return "recusado";

  const state = params.get("state");
  if (!state || !cookie) return "sessao";
  const hash = hashDoEstado(state);
  // Tempo constante sobre os hashes (mesmo tamanho); só então consome, para o state valer um uso.
  if (!timingSafeEqual(Buffer.from(hashDoEstado(cookie), "hex"), Buffer.from(hash, "hex"))) return "sessao";
  const pedido = await deps.consumirEstado(hash, deps.agora());
  if (!pedido) return "sessao";
  // O flag pode ter sido desligado entre o clique e o retorno.
  if (!(await deps.ligado(pedido.tenantId))) return "indisponivel";
  const papel = await deps.papel(pedido.tenantId, pedido.userId);
  if (!papel || !hasPermission(papel, "settings:connection")) return "sessao";

  const code = params.get("code");
  if (!code) return "erro";

  let tokens;
  try {
    tokens = await deps.trocar(code, credenciais);
  } catch (e) {
    if (!(e instanceof ErroOAuthMelhorEnvio)) throw e;
    console.error(`[melhor-envio/retorno] troca do code recusada: ${e.tipo}`);
    return "erro";
  }

  let conta;
  try {
    conta = await deps.conta(tokens.accessToken);
  } catch (e) {
    if (!(e instanceof ErroMelhorEnvio)) throw e;
    console.error(`[melhor-envio/retorno] /me recusado (${e.status}): falta o escopo users-read?`);
    return "erro";
  }

  // null = não deu para saber (a conexão vale; a primeira passada descobre).
  let temEtiqueta: boolean | null = null;
  try {
    temEtiqueta = (await deps.primeiraPagina(tokens.accessToken)).etiquetas.length > 0;
  } catch (e) {
    if (!(e instanceof ErroMelhorEnvio)) throw e;
  }

  await deps.salvar(pedido.tenantId, {
    accessTokenEnc: selar(tokens.accessToken, contextoDoTokenMe(pedido.tenantId, "access"), chave),
    refreshTokenEnc: selar(tokens.refreshToken, contextoDoTokenMe(pedido.tenantId, "refresh"), chave),
    expiraEm: tokens.expiraEm,
    renovacaoExpiraEm: tokens.renovacaoExpiraEm,
    contaNome: conta.nome,
    contaEmail: conta.email,
    temEtiqueta,
    conectadaPor: pedido.userId,
  });
  return temEtiqueta === false ? "conta_vazia" : "conectado";
}

/** Voltou em outro host (www): o cookie é host-only do app., então refaz a navegação lá. Mesmo host → null. */
export function destinoNoApp(url: URL, appUrl: string): string | null {
  const app = new URL(appUrl);
  if (url.host === app.host) return null;
  return `${app.origin}${url.pathname}${url.search}`;
}
