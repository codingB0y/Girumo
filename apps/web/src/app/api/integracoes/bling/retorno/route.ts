import { timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { diaDoBling, listarSituacoesDeVenda, obterEmpresa } from "@/lib/bling/api";
import { criarClienteBling, ErroBling, type ClienteBling } from "@/lib/bling/cliente";
import { LIMITE_DE_TOKEN } from "@/lib/bling/deps";
import { credenciaisBling, ErroOAuthBling, trocarCodigo, type CredenciaisBling, type TokensBling } from "@/lib/bling/oauth";
import { sincronizarLoja } from "@/lib/bling/sincronizar";
import type { EmpresaBling, SituacaoBling } from "@/lib/bling/tipos";
import { readCookie } from "@/lib/links/deep-link";
import { hasPermission, type TenantRole } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { chaveDeIntegracoes, impressaoDaChave, selar } from "@/lib/security/secret-box";
import { contextoDoToken, lerConexaoPorEmpresa } from "@/lib/stores/bling-conexoes";
import { salvarConexao } from "@/lib/stores/bling-conexoes-salvar";
import { consumirEstadoOAuth, COOKIE_DO_ESTADO, cookieDoEstado, hashDoEstado } from "@/lib/stores/bling-oauth-states";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A primeira sincronização (histórico de 90 dias) roda no `after()` desta resposta. */
export const maxDuration = 300;

/** Cada um vira uma mensagem no cartão (spec §6 "Retorno"). */
type Motivo = "conectado" | "recusado" | "sessao" | "comece_aqui" | "outra_loja" | "erro" | "indisponivel";
type Pedido = { tenantId: string; userId: string };

/**
 * A 1ª sincronização leva o que o retorno deixou dos 300 s da função, menos esta folga (soltar a
 * trava, gravar o que chegou); o resto do histórico vem pelo cron. Com menos de 30 s, nem começa.
 */
const FOLGA_DA_FUNCAO_MS = 45_000;
const MINIMO_DA_PRIMEIRA_SINCRONIZACAO_MS = 30_000;
/** Empresa e situações não comem os minutos da 1ª sincronização: o cliente do retorno para em 60 s. */
const PRAZO_DO_CLIENTE_MS = 60_000;

/**
 * GET /api/integracoes/bling/retorno — volta do Bling (spec §3 "Conectar", passo 2). Sem
 * sessão: é uma navegação vinda do bling.com.br, que não carrega o Bearer do painel. Quem
 * autentica é o par state + cookie, como manda o OAuth. Toda saída é 302 para o cartão,
 * apagando o cookie.
 */
export async function GET(req: Request): Promise<Response> {
  const inicio = Date.now();
  let motivo: Motivo;
  try {
    motivo = await concluir(req, inicio);
  } catch (e) {
    // Mensagens de store e do Bling não levam token, code nem cookie.
    console.error(`[bling/retorno] ${(e as Error).message}`);
    motivo = "erro";
  }
  const destino = new URL(`/painel/configuracoes?secao=integracoes&bling=${motivo}`, req.url);
  return new Response(null, {
    status: 302,
    headers: { location: destino.toString(), "set-cookie": cookieDoEstado("", 0), "cache-control": "no-store" },
  });
}

async function concluir(req: Request, inicio: number): Promise<Motivo> {
  const credenciais = credenciaisBling();
  const chave = chaveDeIntegracoes();
  if (!credenciais || !chave) return "indisponivel";
  const params = new URL(req.url).searchParams;
  // A loja recusou na tela do Bling (ou o Bling devolveu erro): não há code a trocar.
  if (params.has("error")) return "recusado";
  // Sem state nenhum: não começou no Conectar Bling da Girumo (a instalação pela Central de Extensões do Bling). Não
  // há como saber de que loja é, e o code vence em 1 min: o cartão pede para começar por aqui.
  if (!params.get("state")) return "comece_aqui";

  const pedido = await consumirPedido(params.get("state"), readCookie(req.headers.get("cookie"), COOKIE_DO_ESTADO));
  if (!pedido || !(await aindaPodeConectar(pedido))) return "sessao";
  const code = params.get("code");
  if (!code) return "erro";
  if (await checkRateLimit(LIMITE_DE_TOKEN.id, LIMITE_DE_TOKEN.max, LIMITE_DE_TOKEN.janelaMs)) {
    console.warn("[bling/retorno] limite global de /oauth/token atingido");
    return "erro";
  }
  return conectar(code, credenciais, chave, pedido, inicio);
}

/**
 * Cookie igual ao parâmetro (tempo constante, sobre os hashes) e state ainda no banco. Só
 * então consome: o segundo retorno com o mesmo state (duplo clique, F5) não chega ao Bling.
 */
async function consumirPedido(state: string | null, cookie: string | null): Promise<Pedido | null> {
  if (!state || !cookie) return null;
  const hash = hashDoEstado(state);
  if (!timingSafeEqual(Buffer.from(hashDoEstado(cookie), "hex"), Buffer.from(hash, "hex"))) return null;
  return consumirEstadoOAuth(hash, new Date());
}

/** Entre o clique e o retorno a pessoa pode ter perdido o papel ou saído da loja. */
async function aindaPodeConectar(pedido: Pedido): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("memberships")
    .select("role")
    .eq("tenant_id", pedido.tenantId)
    .eq("user_id", pedido.userId)
    .not("accepted_at", "is", null)
    .limit(1);
  if (error) throw new Error(error.message);
  const papel = (data as Array<{ role: TenantRole }> | null)?.[0]?.role;
  return papel !== undefined && hasPermission(papel, "settings:connection");
}

/**
 * Troca o code e grava. Token que não chega a ser gravado é só descartado, nunca revogado: o
 * Bling pode tratar a autorização por empresa, e revogar derrubaria a de outra loja que já usa
 * essa conta. Sem uso, o access vence em 6 h e o refresh nunca roda.
 */
async function conectar(code: string, credenciais: CredenciaisBling, chave: Buffer, pedido: Pedido, inicio: number): Promise<Motivo> {
  let tokens: TokensBling;
  try {
    tokens = await trocarCodigo(code, credenciais);
  } catch (e) {
    if (!(e instanceof ErroOAuthBling)) throw e;
    console.error(`[bling/retorno] troca do code recusada: ${e.tipo}`);
    return "erro";
  }
  return gravar(tokens, chave, pedido, inicio);
}

async function gravar(tokens: TokensBling, chave: Buffer, pedido: Pedido, inicio: number): Promise<Motivo> {
  const cliente = criarClienteBling({
    token: async () => tokens.accessToken,
    // Token de segundos atrás recusado não se resolve renovando: só gastaria o limite de /oauth/token.
    renovar: async () => {
      throw new ErroBling("auth", 401, "Bling recusou o token recém-emitido");
    },
    prazo: inicio + PRAZO_DO_CLIENTE_MS,
  });
  const empresa = await empresaDoToken(cliente);
  if (!empresa) return "erro";
  const dona = await lerConexaoPorEmpresa(empresa.id);
  if (dona && dona.tenantId !== pedido.tenantId) return "outra_loja";

  await salvarConexao(pedido.tenantId, {
    companyId: empresa.id,
    companyName: empresa.nome,
    accessTokenEnc: selar(tokens.accessToken, contextoDoToken(pedido.tenantId, "access"), chave),
    refreshTokenEnc: selar(tokens.refreshToken, contextoDoToken(pedido.tenantId, "refresh"), chave),
    accessExpiresAt: tokens.expiraEm,
    keyFp: impressaoDaChave(chave),
    situations: await situacoesDaConta(cliente),
    connectedBy: pedido.userId,
    hoje: diaDoBling(new Date()),
  });
  // A loja volta ao cartão na hora; as vendas começam a chegar logo depois da resposta.
  after(() => primeiraSincronizacao(pedido.tenantId, inicio));
  return "conectado";
}

/**
 * No `after()`: o tempo que o retorno já gastou sai da vida da função (o motor não começa chamada com
 * efeito que não cabe nela) e do orçamento, senão a Vercel mata a função no meio.
 */
async function primeiraSincronizacao(tenantId: string, inicio: number): Promise<void> {
  const vida = maxDuration * 1000 - (Date.now() - inicio);
  const orcamento = vida - FOLGA_DA_FUNCAO_MS;
  if (orcamento < MINIMO_DA_PRIMEIRA_SINCRONIZACAO_MS) {
    console.warn(`[bling/retorno] loja ${tenantId}: sem tempo para a 1ª sincronização; o cron pega a loja`);
    return;
  }
  await sincronizarLoja(tenantId, "conexao", orcamento, vida);
}

/** null = o Bling não deu os dados da empresa: sem o `companyId` os avisos não acham a loja. */
async function empresaDoToken(cliente: ClienteBling): Promise<EmpresaBling | null> {
  try {
    return await obterEmpresa(cliente);
  } catch (e) {
    if (!(e instanceof ErroBling)) throw e;
    console.error(`[bling/retorno] dados da empresa: ${e.tipo}`);
    return null;
  }
}

/**
 * Falhou ou não achou o módulo de vendas: lista vazia, e o motor recarrega na 1ª execução. Nunca as
 * padrão no lugar: gravadas com hora, passariam por situações da conta.
 */
async function situacoesDaConta(cliente: ClienteBling): Promise<SituacaoBling[]> {
  try {
    const situacoes = await listarSituacoesDeVenda(cliente);
    if (situacoes) return situacoes;
  } catch (e) {
    if (!(e instanceof ErroBling)) throw e;
    console.warn(`[bling/retorno] situações não carregaram: ${e.tipo}`);
  }
  return [];
}
