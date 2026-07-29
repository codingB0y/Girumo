/**
 * Cliente HTTP mínimo da Evolution API v2.3.7 para ENVIO de texto (F4).
 *
 * É o transporte que substitui o `sock.sendMessage` do Baileys no cutover. O
 * ritmo anti-ban NÃO mora aqui — ele é aplicado no claim (claim_send_commands) e
 * no record_send. Aqui é só "manda esse texto por esta instância".
 *
 * `fetchImpl` é injetável para teste (sem rede). A apikey é credencial de
 * administração da stack; nunca é logada (ver log.ts / README.evolution.md).
 */

export class EvolutionSendError extends Error {
  /** 0 = não chegou na Evolution (timeout/rede); senão o HTTP status. */
  readonly status: number;

  constructor(status: number, detail?: string) {
    super(`Evolution sendText falhou (${status})${detail ? `: ${detail}` : ""}`);
    this.name = "EvolutionSendError";
    this.status = status;
  }
}

export type SendTextOptions = { mentionAll?: boolean };

export type SendMediaInput = {
  /** URL alcançável pela Evolution (assinada na hora do envio) ou base64. */
  media: string;
  mediatype: "image" | "video" | "document";
  caption?: string;
  mentionAll?: boolean;
};

export type SendPollInput = {
  question: string;
  options: string[];
};

export interface EvolutionSender {
  sendText(instanceName: string, number: string, text: string, opts?: SendTextOptions): Promise<void>;
  sendMedia(instanceName: string, number: string, input: SendMediaInput): Promise<void>;
  sendPoll(instanceName: string, number: string, input: SendPollInput): Promise<void>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type EvolutionSenderConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** Injetável para teste; default é o fetch global. */
  fetchImpl?: FetchLike;
};

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Extrai uma mensagem curta do corpo de erro sem despejar o corpo inteiro
 * (a resposta da Evolution pode conter dados da instância).
 */
function safeDetail(body: string): string {
  return body.slice(0, 200);
}

export function createEvolutionSender(config: EvolutionSenderConfig): EvolutionSender {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const doFetch: FetchLike = config.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /** POST comum a todos os envios: erro de rede vira status 0; !ok vira o status HTTP. */
  async function post(path: string, body: unknown): Promise<void> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : "erro de rede";
      throw new EvolutionSendError(0, reason);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new EvolutionSendError(response.status, safeDetail(detail));
    }
  }

  return {
    async sendText(instanceName, number, text, opts) {
      // Contrato v2.3.7 VERIFICADO no smoke da F1: { number, text } no topo.
      // `number` = número (dígitos) para pessoa, ou o jid inteiro (…@g.us) para
      // grupo — ver send-command.ts.
      await post(`/message/sendText/${encodeURIComponent(instanceName)}`, {
        number,
        text,
        ...(opts?.mentionAll ? { mentionsEveryOne: true } : {}),
      });
    },

    async sendMedia(instanceName, number, input) {
      // ⚠️ NÃO verificado contra a instância real ainda (o smoke da F1 só exercitou
      // sendText). Os nomes de campo seguem a API v2 documentada. Se o smoke e2e
      // acusar 400, o ajuste é AQUI — nada fora deste módulo depende do shape.
      await post(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
        number,
        mediatype: input.mediatype,
        media: input.media,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.mentionAll ? { mentionsEveryOne: true } : {}),
      });
    },

    async sendPoll(instanceName, number, input) {
      // ⚠️ Mesmo aviso do sendMedia — shape a confirmar no smoke e2e.
      await post(`/message/sendPoll/${encodeURIComponent(instanceName)}`, {
        number,
        name: input.question,
        selectableCount: 1,
        values: input.options,
      });
    },
  };
}
