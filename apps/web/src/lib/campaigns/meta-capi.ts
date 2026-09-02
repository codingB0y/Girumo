/**
 * API de Conversões do Meta (CAPI) para o clique do /r/.
 *
 * Por que existe: o pixel do navegador some quando o visitante bloqueia script,
 * usa iOS com prevenção de rastreamento ou sai antes do fbevents.js carregar —
 * e no /r/ isso é a regra, não a exceção: a página vive 600 ms. O evento pelo
 * servidor chega sempre. Os dois carregam o MESMO `event_id`, que é como a Meta
 * junta os dois num só (dedup) em vez de contar Lead dobrado.
 *
 * Puro + um envio isolado: `buildCapiPayload` não toca rede, então o teste cobre
 * o formato inteiro sem mock de servidor. Sem `server-only` de propósito.
 */

/** A Meta mantém cada versão por ~2 anos e avisa 90 dias antes de aposentar. */
export const GRAPH_API_VERSION = "v23.0";

const TIMEOUT_MS = 3000;

export type CapiInput = {
  eventName: string;
  eventId: string;
  eventTimeMs: number;
  sourceUrl: string;
  clientIp: string | null;
  userAgent: string;
  fbclid: string | null;
  fbp: string | null;
  campaignName: string;
  groupId: string | null;
  testCode?: string;
};

export type CapiPayload = {
  data: Array<{
    event_name: string;
    event_time: number;
    event_id: string;
    action_source: "website";
    event_source_url: string;
    user_data: {
      client_ip_address?: string;
      client_user_agent?: string;
      fbc?: string;
      fbp?: string;
    };
    custom_data: { campaign: string; group?: string };
  }>;
  test_event_code?: string;
};

/**
 * `x-forwarded-for` é uma LISTA: o primeiro é o visitante, os seguintes são os
 * proxies. Mandar a lista inteira faz a Meta descartar o campo.
 */
export function firstForwardedIp(header: string | null): string | null {
  const first = (header ?? "").split(",")[0]?.trim();
  return first ? first : null;
}

export function capiEndpoint(pixelId: string): string {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`;
}

/**
 * Sem PII: só IP, UA e os identificadores de clique do próprio Meta. Não temos
 * (nem queremos) e-mail ou telefone de quem clica num link público — pedir isso
 * seria trocar consentimento por match quality.
 */
export function buildCapiPayload(i: CapiInput): CapiPayload {
  const user_data: CapiPayload["data"][0]["user_data"] = {};
  if (i.clientIp) user_data.client_ip_address = i.clientIp;
  if (i.userAgent) user_data.client_user_agent = i.userAgent;
  // fbc SÓ com fbclid real na URL: inventar um estraga a atribuição do anúncio.
  if (i.fbclid) user_data.fbc = `fb.1.${i.eventTimeMs}.${i.fbclid}`;
  if (i.fbp) user_data.fbp = i.fbp;

  const custom_data: CapiPayload["data"][0]["custom_data"] = { campaign: i.campaignName };
  if (i.groupId) custom_data.group = i.groupId;

  const payload: CapiPayload = {
    data: [
      {
        event_name: i.eventName,
        event_time: Math.floor(i.eventTimeMs / 1000), // a Meta quer SEGUNDOS
        event_id: i.eventId,
        action_source: "website",
        event_source_url: i.sourceUrl,
        user_data,
        custom_data,
      },
    ],
  };
  if (i.testCode) payload.test_event_code = i.testCode;
  return payload;
}

/**
 * Envia e NUNCA lança: quem chama está num `after()` do /r/, e uma exceção ali
 * viraria ruído no log sem ajudar ninguém. O token vai no CORPO, nunca na URL —
 * URL entra em log de proxy e de CDN.
 */
export async function sendCapiEvent(a: {
  pixelId: string;
  token: string;
  payload: CapiPayload;
  timeoutMs?: number;
}): Promise<{ ok: boolean; eventsReceived?: number; error?: string }> {
  try {
    const res = await fetch(capiEndpoint(a.pixelId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...a.payload, access_token: a.token }),
      signal: AbortSignal.timeout(a.timeoutMs ?? TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as {
      events_received?: number;
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, eventsReceived: json.events_received ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
