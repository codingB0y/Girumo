/**
 * Aquisição orgânica — normalização do beacon de saída.
 *
 * Camada PURA de propósito: sem `server-only`, sem Supabase, sem `crypto`. É o
 * que permite testar com `tsx --test` (um `import "server-only"` aqui derruba o
 * runner inteiro) e é o único lugar onde a forma do evento é decidida.
 *
 * Por que esta tabela existe em vez de `funnel_events`: aquele é um registro de
 * MARCOS POR TENANT — `unique (tenant_id, event_name)` e FK para
 * `organizations`. Quem clica no WhatsApp da landing ainda não tem conta, então
 * não há tenant a que atribuir a linha. O precedente correto é `demo_requests`
 * (pré-tenant, service-role only), e é o que seguimos.
 */

/**
 * Eventos aceitos. Allowlist fechada: o beacon é público, e sem isto qualquer
 * um escreve `event_name` arbitrário na tabela e polui a série que decide quais
 * páginas cortar daqui a 6 meses.
 */
export const OUTBOUND_EVENTS = ["whatsapp_click"] as const;

export type OutboundEvent = (typeof OUTBOUND_EVENTS)[number];

export function isOutboundEvent(value: unknown): value is OutboundEvent {
  return typeof value === "string" && (OUTBOUND_EVENTS as readonly string[]).includes(value);
}

/**
 * Caminho interno de origem — é o "de qual página saiu o clique". Só aceita
 * caminho do próprio site: barra inicial, sem `//` (que o browser leria como
 * host externo) e sem esquema. O limite de 200 evita que uma query gigante vire
 * cardinalidade infinita no agrupamento.
 */
const PATH_RE = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]{0,199}$/;

export function normalizeSourcePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "/") return "/";
  return PATH_RE.test(trimmed) ? trimmed : null;
}

/** Campos de atribuição. `referrer` é externo (pode ser o Google), os utm_* são nossos. */
const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "referrer",
] as const;

export type AcquisitionAttribution = Record<(typeof ATTRIBUTION_KEYS)[number], string | null>;

export function extractAcquisitionAttribution(
  body: Record<string, unknown>,
): AcquisitionAttribution {
  const out = {} as AcquisitionAttribution;
  for (const key of ATTRIBUTION_KEYS) {
    const raw = body[key];
    out[key] = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 300) : null;
  }
  return out;
}

export type OutboundBeacon = {
  event: OutboundEvent;
  sourcePath: string;
  attribution: AcquisitionAttribution;
};

export type BeaconParse =
  | { ok: true; value: OutboundBeacon }
  | { ok: false; reason: "bad_event" | "bad_path" };

/**
 * Valida o corpo do beacon. Devolve o MOTIVO da recusa em vez de um booleano:
 * o handler responde 204 nos dois casos (não se dá dica a quem sonda), mas
 * precisa poder logar qual metade do payload veio errada — senão um bug de
 * client vira silêncio e a série simplesmente para de crescer sem ninguém ver.
 */
export function parseOutboundBeacon(body: Record<string, unknown>): BeaconParse {
  if (!isOutboundEvent(body.event)) return { ok: false, reason: "bad_event" };

  const sourcePath = normalizeSourcePath(body.source_path);
  if (!sourcePath) return { ok: false, reason: "bad_path" };

  return {
    ok: true,
    value: {
      event: body.event,
      sourcePath,
      attribution: extractAcquisitionAttribution(body),
    },
  };
}
