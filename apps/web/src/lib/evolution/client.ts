import "server-only";

import { resolveSecret } from "@/lib/runtime-secrets";

/**
 * Client HTTP da Evolution API v2.3.7 (lifecycle de instância).
 *
 * Server-only: a apikey é credencial de administração da stack inteira — quem a
 * tem cria e apaga qualquer instância. Nunca pode chegar ao browser.
 *
 * Este client cobre só o ciclo de vida (criar/conectar/QR/logout/grupos), que é
 * síncrono e leve. Envio de mensagem NUNCA passa por aqui: vai para
 * `engine_commands` e é consumido pelo worker, que aplica o anti-ban.
 */

/** Eventos assinados no webhook por instância. Ver `webhook-schema.ts`. */
export const EVOLUTION_WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "GROUP_PARTICIPANTS_UPDATE",
  "GROUPS_UPSERT",
  "MESSAGES_UPDATE",
] as const;

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * `fetchAllGroups` busca a foto de perfil de CADA grupo, em série, contra o
 * WhatsApp (ver whatsapp.baileys.service na v2.3.7). Quem tem muitos grupos
 * estoura 10s com facilidade — e o timeout cairia justamente em quem mais
 * precisa do sync.
 */
const FETCH_GROUPS_TIMEOUT_MS = 60_000;

export class EvolutionError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(path: string, status: number, detail?: string) {
    super(`Evolution ${path} falhou (${status})${detail ? `: ${detail}` : ""}`);
    this.name = "EvolutionError";
    this.status = status;
    this.path = path;
  }
}

type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
};

/**
 * Resolvido a cada chamada, não no import: `next build` roda sem as envs de
 * runtime e falhar no topo do módulo quebraria o build inteiro.
 */
function getEvolutionConfig(): EvolutionConfig {
  const baseUrl = resolveSecret(
    "EVOLUTION_API_URL",
    process.env.EVOLUTION_API_URL,
    process.env.NODE_ENV,
    "http://localhost:8080",
  );
  const apiKey = resolveSecret(
    "EVOLUTION_API_KEY",
    process.env.EVOLUTION_API_KEY,
    process.env.NODE_ENV,
    "dev-evolution-key",
  );
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/**
 * Extrai uma mensagem curta do corpo de erro.
 *
 * Deliberadamente NÃO devolve o corpo inteiro: a resposta de `instance/create`
 * inclui o token da instância, e despejar isso numa Error acabaria em log.
 */
function safeDetail(body: unknown): string | undefined {
  if (typeof body === "string") return body.slice(0, 200);
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const candidate = record.message ?? record.error ?? record.response;
    if (typeof candidate === "string") return candidate.slice(0, 200);
    if (Array.isArray(candidate)) return candidate.filter((v) => typeof v === "string").join("; ").slice(0, 200);
  }
  return undefined;
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const { baseUrl, apiKey } = getEvolutionConfig();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        apikey: apiKey,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Timeout ou rede: 0 sinaliza "não chegou na Evolution".
    const reason = error instanceof Error ? error.name : "erro de rede";
    throw new EvolutionError(path, 0, reason);
  }

  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // Mantém o texto cru — safeDetail trunca.
  }

  if (!response.ok) throw new EvolutionError(path, response.status, safeDetail(parsed));

  return parsed as T;
}

/**
 * instanceName na Evolution a partir do id da linha em `instances`.
 *
 * Formato `gr_<uuid>`: sem dado de tenant no nome, e resolvível de volta por
 * `(provider, provider_instance_id)`.
 */
export function providerInstanceId(instanceId: string): string {
  return `gr_${instanceId}`;
}

/**
 * URL pública que a Evolution vai chamar. Precisa ser alcançável da VPS, então
 * sai de `NEXT_PUBLIC_APP_URL` (domínio do app), não de `req.url` — que em
 * preview/proxy aponta para um host que a VPS não resolve.
 */
export function evolutionWebhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL ausente — webhook da Evolution não pode ser registrado");
  return `${base}/api/webhooks/evolution`;
}

export type CreateInstanceResult = {
  instanceName: string;
};

/** Cria a instância na Evolution. Idempotência é responsabilidade do caller. */
export async function createInstance(instanceName: string): Promise<CreateInstanceResult> {
  await request("/instance/create", {
    method: "POST",
    body: {
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    },
  });
  return { instanceName };
}

/**
 * Registra o webhook desta instância.
 *
 * `enabled: true` é obrigatório — sem ele a v2.3.7 devolve 400 (achado da F1).
 * O secret vai por header customizado; verificado na v2.3.7 (`webhook.controller`
 * repassa `headers` no POST de saída).
 */
export async function setWebhook(
  instanceName: string,
  url: string,
  secret: string,
): Promise<void> {
  await request(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: {
      webhook: {
        enabled: true,
        url,
        headers: { "x-evolution-webhook-secret": secret },
        byEvents: false,
        base64: false,
        events: [...EVOLUTION_WEBHOOK_EVENTS],
      },
    },
  });
}

export type ConnectResult = {
  /** Payload de pareamento (`2@...`). Ausente se a instância já está conectada. */
  code?: string;
  pairingCode?: string | null;
};

/**
 * Inicia o pareamento e devolve o QR atual.
 *
 * O QR também chega por webhook (`qrcode.updated`); esta chamada existe para a
 * primeira renderização não esperar o próximo ciclo de emissão.
 */
export async function connectInstance(instanceName: string): Promise<ConnectResult> {
  const data = await request<{ code?: string; pairingCode?: string | null }>(
    `/instance/connect/${encodeURIComponent(instanceName)}`,
  );
  return { code: data?.code, pairingCode: data?.pairingCode ?? null };
}

export type ConnectionStateResult = {
  /** open | connecting | close */
  state: string | null;
};

export async function connectionState(instanceName: string): Promise<ConnectionStateResult> {
  const data = await request<{ instance?: { state?: string } }>(
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
  );
  return { state: data?.instance?.state ?? null };
}

/** Desconecta a sessão do WhatsApp, mantendo a instância na Evolution. */
export async function logoutInstance(instanceName: string): Promise<void> {
  await request(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

/** Remove a instância da Evolution. Usado no rollback de criação. */
export async function deleteInstance(instanceName: string): Promise<void> {
  await request(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export type EvolutionGroup = {
  id: string;
  subject?: string;
  size?: number;
  /** Só presente com `getParticipants=true`. Usado para decidir se somos admin. */
  participants?: Array<{ id?: string | null; phoneNumber?: string | null; admin?: string | null }>;
  owner?: string | null;
  ownerPn?: string | null;
};

/**
 * Lista os grupos da instância, com participantes.
 *
 * `getParticipants=true` é necessário para saber em quais grupos somos admin —
 * e só grupos admin alimentam captura de leads (ver `admin-group.ts`). Custa
 * uma resposta bem maior, mas sem isso a alternativa seria uma chamada por
 * grupo, muito pior.
 */
export async function fetchAllGroups(instanceName: string): Promise<EvolutionGroup[]> {
  // `getParticipants` é obrigatório no schema da v2.3.7 (enum 'true'|'false'):
  // omitir devolve 400, não a lista inteira.
  const data = await request<EvolutionGroup[] | null>(
    `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=true`,
    { timeoutMs: FETCH_GROUPS_TIMEOUT_MS },
  );
  return Array.isArray(data) ? data : [];
}
