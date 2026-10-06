import "server-only";

import { ZernioError, type ConversationMessageInput, type PrivateReplyInput, type PublicReplyInput, type Transport, type ZernioAccount } from "./types";

const BASE_URL = "https://zernio.com/api";
/** A Zernio espera nosso 2xx em 5 s; o envio dela tem que caber antes disso. */
const TIMEOUT_MS = 4_000;

type Chamada = { method: "GET" | "POST" | "DELETE"; path: string; query?: Record<string, string>; body?: unknown; idempotencyKey?: string };

export function createZernioTransport(deps: { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string }): Transport {
  const doFetch = deps.fetchImpl ?? fetch;
  const base = (deps.baseUrl ?? BASE_URL).replace(/\/+$/, "");

  async function call<T>(c: Chamada): Promise<T> {
    if (!deps.apiKey) throw new ZernioError(0, "config_error", "zernio_api_key_missing", null, "ZERNIO_API_KEY ausente.");
    const url = new URL(`${base}/${c.path}`);
    for (const [k, v] of Object.entries(c.query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Authorization: `Bearer ${deps.apiKey}`, Accept: "application/json" };
    if (c.body !== undefined) headers["Content-Type"] = "application/json";
    if (c.idempotencyKey) headers["Idempotency-Key"] = c.idempotencyKey;
    let res: Response;
    try {
      res = await doFetch(url, { method: c.method, headers, body: c.body === undefined ? undefined : JSON.stringify(c.body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      // Nunca inclui a URL nem a chave na mensagem.
      throw new ZernioError(0, "network_error", "network_error", null, e instanceof Error ? e.message : "rede");
    }
    const texto = await res.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const env = (json ?? {}) as { error?: string; type?: string; code?: string; details?: Record<string, unknown> };
      throw new ZernioError(res.status, env.type ?? "api_error", env.code ?? `http_${res.status}`, env.details ?? null, env.error ?? `Zernio respondeu ${res.status}.`);
    }
    return json as T;
  }

  const seg = encodeURIComponent;

  return {
    async ensureProfile(name) {
      try {
        const r = await call<{ profile?: { _id?: string } }>({ method: "POST", path: "v1/profiles", body: { name } });
        if (!r.profile?._id) throw new ZernioError(502, "api_error", "profile_without_id", null, "Perfil sem id.");
        return r.profile._id;
      } catch (e) {
        const existente = e instanceof ZernioError && e.status === 409 ? e.details?.existingProfileId : undefined;
        if (typeof existente === "string" && existente) return existente;
        throw e;
      }
    },
    async connectUrl(profileId, redirectUrl) {
      const r = await call<{ authUrl?: string }>({ method: "GET", path: "v1/connect/instagram", query: { profileId, redirect_url: redirectUrl, scopes: "comments,messaging" } });
      // O painel faz `location.assign` com isto: só https, nunca `javascript:` e afins.
      if (!r.authUrl || !URL.canParse(r.authUrl) || new URL(r.authUrl).protocol !== "https:") throw new ZernioError(502, "api_error", "auth_url_missing", null, "Resposta sem authUrl https.");
      return r.authUrl;
    },
    async listAccounts(profileId) {
      const r = await call<{ accounts?: Array<{ _id: string; username?: string; isActive?: boolean; needsReconnection?: boolean }> }>({ method: "GET", path: "v1/accounts", query: { profileId, platform: "instagram" } });
      return (r.accounts ?? []).map<ZernioAccount>((a) => ({ id: a._id, username: a.username ?? "", isActive: a.isActive === true, needsReconnection: a.needsReconnection === true }));
    },
    async deleteAccount(accountId) {
      try {
        await call({ method: "DELETE", path: `v1/accounts/${seg(accountId)}` });
      } catch (e) {
        if (!(e instanceof ZernioError) || e.status !== 404) throw e;
      }
    },
    async privateReply(i: PrivateReplyInput) {
      await call({ method: "POST", path: `v1/inbox/comments/${seg(i.platformPostId)}/${seg(i.commentId)}/private-reply`, body: { accountId: i.accountId, message: i.message }, idempotencyKey: i.idempotencyKey });
    },
    async publicReply(i: PublicReplyInput) {
      await call({ method: "POST", path: `v1/inbox/comments/${seg(i.platformPostId)}`, body: { accountId: i.accountId, message: i.message, commentId: i.commentId }, idempotencyKey: i.idempotencyKey });
    },
    async sendMessage(i: ConversationMessageInput) {
      await call({ method: "POST", path: `v1/inbox/conversations/${seg(i.conversationId)}/messages`, body: { accountId: i.accountId, message: i.message }, idempotencyKey: i.idempotencyKey });
    },
  };
}
