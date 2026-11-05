import "server-only";

import { z } from "zod";
import { ZernioError } from "@/lib/ig/transport/types";

/**
 * Caixa de entrada da Zernio (conversas e mensagens do Instagram). Separado de `transport/zernio.ts`, que
 * serve o motor e responde em 4 s: aqui as chamadas podem demorar (a lista chegou a 60–207 s em 08/10).
 * Tudo que volta é dado externo: passa por schema e o que não bate é descartado, nunca confiado.
 */

const BASE_URL = "https://zernio.com/api";
const TIMEOUT_MS = 25_000;

export type InboxErrorKind = "auth" | "not_found" | "conflict" | "invalid" | "rate_limited" | "server" | "network" | "config" | "other";

export class InboxError extends ZernioError {
  constructor(
    status: number,
    type: string,
    code: string,
    details: Record<string, unknown> | null,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(status, type, code, details, message);
    this.name = "InboxError";
  }

  get kind(): InboxErrorKind {
    const s = this.status;
    if (s === 0) return this.code === "zernio_api_key_missing" ? "config" : "network";
    if (s === 401 || s === 403) return "auth";
    if (s === 404) return "not_found";
    if (s === 409) return "conflict";
    if (s === 422 || s === 400) return "invalid";
    if (s === 429) return "rate_limited";
    return s >= 500 ? "server" : "other";
  }
}

const texto = z.string().nullish().transform((v) => v ?? null);

const conversaSchema = z.object({
  id: z.string().min(1),
  participantId: z.string().min(1),
  participantName: texto,
  // Não documentado na lista (só no webhook): aceita se vier.
  participantUsername: texto,
  lastMessage: texto,
  updatedTime: texto,
  unreadCount: z.number().int().nonnegative().catch(0),
});

const anexoSchema = z.object({ type: z.string().catch("file"), mimeType: texto, filename: texto });

const mensagemSchema = z.object({
  id: z.string().min(1),
  message: texto,
  direction: z.enum(["incoming", "outgoing"]),
  createdAt: z.string().min(1),
  attachments: z.array(anexoSchema).catch([]),
  storyReply: z.unknown().optional(),
  isStoryMention: z.boolean().catch(false),
  isDeleted: z.boolean().catch(false),
});

const paginaSchema = z.object({ hasMore: z.boolean().catch(false), nextCursor: texto }).catch({ hasMore: false, nextCursor: null });

export type InboxConversation = z.infer<typeof conversaSchema>;
export type InboxMessage = Omit<z.infer<typeof mensagemSchema>, "storyReply"> & { storyReply: boolean };

export type Pagina<T> = { items: T[]; nextCursor: string | null };

/** Valida item a item: um item torto some, a página não cai. */
function itens<S extends z.ZodType>(bruto: unknown, schema: S): Array<z.infer<S>> {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((i) => {
    const r = schema.safeParse(i);
    return r.success ? [r.data] : [];
  });
}

function proximo(bruto: unknown): string | null {
  const p = paginaSchema.parse(bruto);
  return p.hasMore ? p.nextCursor : null;
}

export type InboxClient = {
  listConversations(i: { accountId: string; cursor?: string; limit?: number }): Promise<Pagina<InboxConversation>>;
  /** Da mais nova para a mais velha; `cursor` é opaco (o `nextCursor` da página anterior). */
  listMessages(i: { conversationId: string; accountId: string; cursor?: string; limit?: number }): Promise<Pagina<InboxMessage>>;
  /** `humanAgent`: fora das 24 h, dentro de 7 dias (tag de atendimento humano). */
  sendText(i: { conversationId: string; accountId: string; message: string; humanAgent: boolean; idempotencyKey: string }): Promise<{ messageId: string | null }>;
  markRead(i: { conversationId: string; accountId: string }): Promise<void>;
  /** Link novo (assinado, expira) do anexo `index` da mensagem. */
  attachmentUrl(i: { conversationId: string; messageId: string; index: number; accountId: string }): Promise<string>;
  deleteConversation(i: { conversationId: string; accountId: string }): Promise<void>;
};

type Chamada = { method: "GET" | "POST" | "DELETE"; path: string; query?: Record<string, string>; body?: unknown; idempotencyKey?: string };

export function createZernioInbox(deps: { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string }): InboxClient {
  const doFetch = deps.fetchImpl ?? fetch;
  const base = (deps.baseUrl ?? BASE_URL).replace(/\/+$/, "");
  const seg = encodeURIComponent;

  async function call(c: Chamada): Promise<unknown> {
    if (!deps.apiKey) throw new InboxError(0, "config_error", "zernio_api_key_missing", null, "ZERNIO_API_KEY ausente.");
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
      throw new InboxError(0, "network_error", "network_error", null, e instanceof Error ? e.message : "rede");
    }
    const bruto = await res.text();
    let json: unknown = null;
    try {
      json = bruto ? JSON.parse(bruto) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const env = (json ?? {}) as { error?: string; type?: string; code?: string; details?: Record<string, unknown> };
      const espera = Number(res.headers.get("retry-after"));
      throw new InboxError(res.status, env.type ?? "api_error", env.code ?? `http_${res.status}`, env.details ?? null, env.error ?? `Zernio respondeu ${res.status}.`, Number.isFinite(espera) && espera > 0 ? espera : null);
    }
    return json;
  }

  return {
    async listConversations(i) {
      const query: Record<string, string> = { accountId: i.accountId, limit: String(Math.min(i.limit ?? 100, 100)) };
      if (i.cursor) query.cursor = i.cursor;
      const r = (await call({ method: "GET", path: "v1/inbox/conversations", query })) as { data?: unknown; conversations?: unknown; pagination?: unknown } | null;
      return { items: itens(r?.data ?? r?.conversations, conversaSchema), nextCursor: proximo(r?.pagination) };
    },
    async listMessages(i) {
      const query: Record<string, string> = { accountId: i.accountId, limit: String(Math.min(i.limit ?? 50, 100)), sortOrder: "desc" };
      if (i.cursor) query.cursor = i.cursor;
      const r = (await call({ method: "GET", path: `v1/inbox/conversations/${seg(i.conversationId)}/messages`, query })) as { messages?: unknown; pagination?: unknown } | null;
      const items = itens(r?.messages, mensagemSchema).map(({ storyReply, ...m }) => ({ ...m, storyReply: storyReply != null && storyReply !== false }));
      return { items, nextCursor: proximo(r?.pagination) };
    },
    async sendText(i) {
      const body = { accountId: i.accountId, message: i.message, ...(i.humanAgent ? { messagingType: "MESSAGE_TAG", messageTag: "HUMAN_AGENT" } : {}) };
      const r = (await call({ method: "POST", path: `v1/inbox/conversations/${seg(i.conversationId)}/messages`, body, idempotencyKey: i.idempotencyKey })) as { data?: { messageId?: unknown } } | null;
      const id = r?.data?.messageId;
      // A mensagem já saiu: formato inesperado vira `null`, nunca erro.
      return { messageId: typeof id === "string" && id ? id : null };
    },
    async markRead(i) {
      await call({ method: "POST", path: `v1/inbox/conversations/${seg(i.conversationId)}/read`, body: { accountId: i.accountId } });
    },
    async attachmentUrl(i) {
      const r = (await call({ method: "GET", path: `v1/inbox/conversations/${seg(i.conversationId)}/messages/${seg(i.messageId)}/attachments/${i.index}`, query: { accountId: i.accountId, format: "json" } })) as { url?: unknown; data?: { url?: unknown } } | null;
      // A chave exata do JSON não é documentada além de `url`; aceita também dentro de `data`.
      const url = r?.url ?? r?.data?.url;
      if (typeof url !== "string" || !url) throw new InboxError(502, "api_error", "attachment_without_url", null, "Resposta sem link do anexo.");
      return url;
    },
    async deleteConversation(i) {
      await call({ method: "DELETE", path: `v1/inbox/conversations/${seg(i.conversationId)}`, query: { accountId: i.accountId } });
    },
  };
}
