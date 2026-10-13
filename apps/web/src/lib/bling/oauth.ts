import "server-only";

import { z } from "zod";

/**
 * OAuth do Bling (API v3): URL de autorização, troca do code, renovação e revogação.
 *
 * Só conversa com o Bling. Guardar token (cifrado) e serializar a renovação é da store e
 * do motor: o refresh token ROTACIONA, então duas renovações em paralelo matariam a loja.
 * A credencial do app vai no Basic — o Bling recusa no corpo — e nunca entra em mensagem
 * de erro, log ou URL.
 */

export const BLING_AUTHORIZE_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
export const BLING_TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";
export const BLING_REVOKE_URL = "https://api.bling.com.br/Api/v3/oauth/revoke";

const TIMEOUT_MS = 15_000;

export type CredenciaisBling = { clientId: string; clientSecret: string };

/** BLING_CLIENT_ID e BLING_CLIENT_SECRET não vazios; senão null (integração indisponível). */
export function credenciaisBling(env: NodeJS.ProcessEnv = process.env): CredenciaisBling | null {
  // trim: valor colado no painel da Vercel com quebra de linha no fim vira credencial inválida.
  const clientId = env.BLING_CLIENT_ID?.trim();
  const clientSecret = env.BLING_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function urlDeAutorizacao(clientId: string, state: string): string {
  return `${BLING_AUTHORIZE_URL}?${new URLSearchParams({ response_type: "code", client_id: clientId, state })}`;
}

export type TokensBling = { accessToken: string; refreshToken: string; expiraEm: Date };

export type TipoErroOAuth = "concessao_invalida" | "cliente_invalido" | "limite" | "transitorio" | "outro";

export class ErroOAuthBling extends Error {
  readonly tipo: TipoErroOAuth;
  readonly status: number | null;

  constructor(tipo: TipoErroOAuth, status: number | null, mensagem: string) {
    super(mensagem);
    this.name = "ErroOAuthBling";
    this.tipo = tipo;
    this.status = status;
  }
}

type Opcoes = { fetchImpl?: typeof fetch; agora?: () => number; timeoutMs?: number };

const respostaDeToken = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.coerce.number().positive(),
});

/** Os dois formatos de erro do Bling: `{"error":"invalid_grant"}` e `{"error":{"type":"…"}}`. */
const corpoDeErro = z.object({ error: z.union([z.string(), z.object({ type: z.string() })]) });

/**
 * Só identificador (letras e "_"), como `invalid_grant` e `UNAUTHORIZED_ERROR`. Descrição
 * fica de fora: servidor que ecoa o code ou o token na descrição levaria o segredo ao log.
 */
const CODIGO_SEGURO = /^[A-Za-z_]{1,40}$/;

export function trocarCodigo(code: string, cred: CredenciaisBling, opcoes: Opcoes = {}): Promise<TokensBling> {
  return pedirToken({ grant_type: "authorization_code", code }, cred, opcoes);
}

export function renovarToken(refreshToken: string, cred: CredenciaisBling, opcoes: Opcoes = {}): Promise<TokensBling> {
  return pedirToken({ grant_type: "refresh_token", refresh_token: refreshToken }, cred, opcoes);
}

/** Melhor esforço: nunca lança. Quem chama já está desligando a loja; a falha fica só no log. */
export async function revogarToken(token: string, cred: CredenciaisBling, opcoes: Opcoes = {}): Promise<void> {
  const r = await postar(BLING_REVOKE_URL, { token, token_type_hint: "refresh_token" }, cred, opcoes);
  if (!r) console.warn("[bling/oauth] revogação sem resposta (rede ou tempo esgotado)");
  else if (r.status < 200 || r.status >= 300) console.warn(`[bling/oauth] revogação recusada: ${descricao(r)}`);
}

async function pedirToken(campos: Record<string, string>, cred: CredenciaisBling, opcoes: Opcoes): Promise<TokensBling> {
  // Conta a validade do INÍCIO do pedido: o token nasceu depois, então a estimativa erra para menos.
  const inicio = (opcoes.agora ?? Date.now)();
  const r = await postar(BLING_TOKEN_URL, campos, cred, opcoes);
  if (!r) throw new ErroOAuthBling("transitorio", null, "Bling OAuth: sem resposta (rede ou tempo esgotado)");
  if (r.status < 200 || r.status >= 300) throw new ErroOAuthBling(tipoDoErro(r), r.status, `Bling OAuth recusou: ${descricao(r)}`);
  const tokens = respostaDeToken.safeParse(r.json);
  if (!tokens.success) {
    throw new ErroOAuthBling("outro", r.status, "Bling OAuth: resposta sem access_token, refresh_token ou expires_in");
  }
  return {
    accessToken: tokens.data.access_token,
    refreshToken: tokens.data.refresh_token,
    expiraEm: new Date(inicio + tokens.data.expires_in * 1000),
  };
}

type Resposta = { status: number; json: unknown };

/** POST form-urlencoded com Basic. null = não chegou resposta inteira (rede, timeout, corpo cortado). */
async function postar(url: string, campos: Record<string, string>, cred: CredenciaisBling, opcoes: Opcoes): Promise<Resposta | null> {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "1.0",
        "enable-jwt": "1",
      },
      body: new URLSearchParams(campos).toString(),
      signal: AbortSignal.timeout(opcoes.timeoutMs ?? TIMEOUT_MS),
    });
    return { status: res.status, json: lerJson(await res.text()) };
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

function tipoDoErro(r: Resposta): TipoErroOAuth {
  if (r.status === 429) return "limite";
  if (r.status >= 500) return "transitorio";
  if (codigoDoErro(r)?.toLowerCase() === "invalid_client") return "cliente_invalido";
  // invalid_grant, invalid_token, UNAUTHORIZED_ERROR ("Empresa inativa")…: a concessão não vale mais.
  if (r.status === 400 || r.status === 401 || r.status === 403) return "concessao_invalida";
  return "outro";
}

function codigoDoErro(r: Resposta): string | null {
  const corpo = corpoDeErro.safeParse(r.json);
  if (!corpo.success) return null;
  const codigo = typeof corpo.data.error === "string" ? corpo.data.error : corpo.data.error.type;
  return CODIGO_SEGURO.test(codigo) ? codigo : null;
}

function descricao(r: Resposta): string {
  const codigo = codigoDoErro(r);
  return codigo ? `HTTP ${r.status} (${codigo})` : `HTTP ${r.status}`;
}
