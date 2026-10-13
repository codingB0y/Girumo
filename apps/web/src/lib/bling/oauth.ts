import "server-only";

import { z } from "zod";

import { lerTextoComTeto, TETO_RESPOSTA_BYTES } from "./cliente";

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
/** O Bling dá 6 h; acima de 30 dias não é resposta dele (e o `expiraEm` sairia absurdo). */
const VALIDADE_MAXIMA_S = 30 * 24 * 60 * 60;
/** Só esses códigos provam que a concessão morreu (renovar não resolve, só reconectar). Sem caixa. */
const CONCESSAO_MORTA = new Set(["invalid_grant", "invalid_token", "unauthorized_error"]);

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

/** Os tokens vão em header (Bearer) e em formulário: só ASCII visível, sem espaço, CR ou LF. */
const tokenSeguro = z.string().regex(/^[\x21-\x7E]+$/);

const respostaDeToken = z.object({
  access_token: tokenSeguro,
  refresh_token: tokenSeguro,
  // Número ou texto de dígitos (tolerado); fração, zero ou além de 30 dias → "outro".
  expires_in: z
    .union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
    .pipe(z.number().int().positive().max(VALIDADE_MAXIMA_S)),
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
  if (!r) throw new ErroOAuthBling("transitorio", null, "Bling OAuth: sem resposta inteira (rede, tempo esgotado ou corpo grande demais)");
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

/**
 * POST form-urlencoded com Basic. null = não chegou resposta inteira (rede, timeout,
 * redirecionamento, corpo cortado ou acima do teto).
 */
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
      // Num 307/308 o fetch reenviaria o corpo (com o code ou o refresh token) para outro endereço.
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

function tipoDoErro(r: Resposta): TipoErroOAuth {
  if (r.status === 429) return "limite";
  if (r.status >= 500) return "transitorio";
  const codigo = codigoDoErro(r)?.toLowerCase();
  if (codigo === "invalid_client") return "cliente_invalido";
  // Pelo código, não pelo status: 400/401/403 de proxy, WAF ou pedido malformado não pode desligar a loja.
  if (codigo && CONCESSAO_MORTA.has(codigo)) return "concessao_invalida";
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
