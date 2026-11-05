import "server-only";

import { z } from "zod";

import { getPublicSiteUrl } from "@/lib/brand";
import { lerTextoComTeto, TETO_RESPOSTA_BYTES } from "@/lib/bling/cliente";

/**
 * OAuth do Melhor Envio: URL de autorização, troca do code e renovação.
 *
 * Só conversa com o Melhor Envio. Guardar token (cifrado) e serializar a renovação é da
 * store e do motor: o refresh token rotaciona. A credencial do app vai no corpo do
 * formulário e, como code e tokens, nunca entra em mensagem de erro, log ou URL.
 */

export const ME_AUTHORIZE_URL = "https://melhorenvio.com.br/oauth/authorize";
export const ME_TOKEN_URL = "https://melhorenvio.com.br/oauth/token";
export const ESCOPOS_ME = "orders-read shipping-tracking users-read";
export const USER_AGENT_ME = "Girumo (contato@girumo.com.br)";

const TIMEOUT_MS = 15_000;
const DIA_S = 24 * 60 * 60;
/** O Melhor Envio dá 30 dias; acima de 60 não é resposta dele. */
const VALIDADE_MAXIMA_S = 60 * DIA_S;
/** Janela fixa em que o refresh token vale, contada do início do pedido. */
const RENOVACAO_MS = 45 * DIA_S * 1000;
const CONCESSAO_MORTA = "invalid_grant";

export type OpcoesHttp = { fetchImpl?: typeof fetch; agora?: () => number; timeoutMs?: number };

export type CredenciaisMelhorEnvio = { clientId: string; clientSecret: string };

export function credenciaisMelhorEnvio(env: NodeJS.ProcessEnv = process.env): CredenciaisMelhorEnvio | null {
  const clientId = env.MELHORENVIO_CLIENT_ID?.trim();
  const clientSecret = env.MELHORENVIO_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function urlDoRetorno(): string {
  return `${getPublicSiteUrl()}/api/integracoes/melhor-envio/retorno`;
}

export function urlDeAutorizacao(clientId: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: urlDoRetorno(),
    response_type: "code",
    state,
    scope: ESCOPOS_ME,
  });
  return `${ME_AUTHORIZE_URL}?${q}`;
}

export type TokensMelhorEnvio = { accessToken: string; refreshToken: string; expiraEm: Date; renovacaoExpiraEm: Date };

export type TipoErroOAuthMe = "concessao_invalida" | "cliente_invalido" | "limite" | "transitorio" | "outro";

export class ErroOAuthMelhorEnvio extends Error {
  readonly tipo: TipoErroOAuthMe;
  readonly status: number | null;

  constructor(tipo: TipoErroOAuthMe, status: number | null, mensagem: string) {
    super(mensagem);
    this.name = "ErroOAuthMelhorEnvio";
    this.tipo = tipo;
    this.status = status;
  }
}

/** Os tokens vão em header (Bearer) e em formulário: só ASCII visível, sem espaço, CR ou LF. */
export const tokenSeguro = z.string().max(4096).regex(/^[\x21-\x7E]+$/);

const respostaDeToken = z.object({
  access_token: tokenSeguro,
  refresh_token: tokenSeguro,
  expires_in: z
    .union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
    .pipe(z.number().int().positive().max(VALIDADE_MAXIMA_S)),
});

const corpoDeErro = z.object({ error: z.string() });

/** Só identificador (letras e "_"): descrição fica de fora, pois o servidor pode ecoar segredo. */
const CODIGO_SEGURO = /^[A-Za-z_]{1,40}$/;

export async function trocarCodigo(code: string, cred: CredenciaisMelhorEnvio, opcoes: OpcoesHttp = {}): Promise<TokensMelhorEnvio> {
  if (!tokenSeguro.safeParse(code).success) throw new ErroOAuthMelhorEnvio("outro", null, "Melhor Envio OAuth: code em formato inválido");
  return pedirToken({ grant_type: "authorization_code", redirect_uri: urlDoRetorno(), code }, cred, opcoes);
}

export async function renovarToken(refreshToken: string, cred: CredenciaisMelhorEnvio, opcoes: OpcoesHttp = {}): Promise<TokensMelhorEnvio> {
  if (!tokenSeguro.safeParse(refreshToken).success) {
    throw new ErroOAuthMelhorEnvio("concessao_invalida", null, "Melhor Envio OAuth: refresh token em formato inválido");
  }
  return pedirToken({ grant_type: "refresh_token", refresh_token: refreshToken }, cred, opcoes);
}

async function pedirToken(campos: Record<string, string>, cred: CredenciaisMelhorEnvio, opcoes: OpcoesHttp): Promise<TokensMelhorEnvio> {
  // Conta a validade do INÍCIO do pedido: o token nasceu depois, então a estimativa erra para menos.
  const inicio = (opcoes.agora ?? Date.now)();
  const r = await postar({ ...campos, client_id: cred.clientId, client_secret: cred.clientSecret }, opcoes);
  if (!r) throw new ErroOAuthMelhorEnvio("transitorio", null, "Melhor Envio OAuth: sem resposta inteira (rede, tempo esgotado ou corpo grande demais)");
  if (r.status < 200 || r.status >= 300) throw new ErroOAuthMelhorEnvio(tipoDoErro(r), r.status, `Melhor Envio OAuth recusou: ${descricao(r)}`);
  const tokens = respostaDeToken.safeParse(r.json);
  if (!tokens.success) {
    throw new ErroOAuthMelhorEnvio("outro", r.status, "Melhor Envio OAuth: resposta sem access_token, refresh_token ou expires_in válidos");
  }
  return {
    accessToken: tokens.data.access_token,
    refreshToken: tokens.data.refresh_token,
    expiraEm: new Date(inicio + tokens.data.expires_in * 1000),
    renovacaoExpiraEm: new Date(inicio + RENOVACAO_MS),
  };
}

type Resposta = { status: number; json: unknown };

/** null = não chegou resposta inteira (rede, timeout, redirecionamento, corpo cortado ou acima do teto). */
async function postar(campos: Record<string, string>, opcoes: OpcoesHttp): Promise<Resposta | null> {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(ME_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": USER_AGENT_ME,
      },
      body: new URLSearchParams(campos).toString(),
      // Num 307/308 o fetch reenviaria o corpo (com code, refresh token e segredo) para outro endereço.
      redirect: "error",
      signal: AbortSignal.timeout(opcoes.timeoutMs ?? TIMEOUT_MS),
    });
    const texto = await lerTextoComTeto(res, TETO_RESPOSTA_BYTES);
    return texto === null ? null : { status: res.status, json: lerJson(texto) };
  } catch {
    return null;
  }
}

function lerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function tipoDoErro(r: Resposta): TipoErroOAuthMe {
  if (r.status === 429) return "limite";
  if (r.status >= 500) return "transitorio";
  const codigo = codigoDoErro(r)?.toLowerCase();
  if (codigo === "invalid_client") return "cliente_invalido";
  if (codigo === CONCESSAO_MORTA) return "concessao_invalida";
  // Refresh token revogado nas versões antigas do OAuth do Laravel; com 400 é pedido malformado.
  if (codigo === "invalid_request" && r.status === 401) return "concessao_invalida";
  return "outro";
}

function codigoDoErro(r: Resposta): string | null {
  const corpo = corpoDeErro.safeParse(r.json);
  return corpo.success && CODIGO_SEGURO.test(corpo.data.error) ? corpo.data.error : null;
}

function descricao(r: Resposta): string {
  const codigo = codigoDoErro(r);
  return codigo ? `HTTP ${r.status} (${codigo})` : `HTTP ${r.status}`;
}
