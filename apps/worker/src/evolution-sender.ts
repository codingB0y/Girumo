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

export interface EvolutionSender {
  sendText(instanceName: string, number: string, text: string): Promise<void>;
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

  return {
    async sendText(instanceName, number, text) {
      const path = `/message/sendText/${encodeURIComponent(instanceName)}`;
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: {
            apikey: config.apiKey,
            "Content-Type": "application/json",
          },
          // Contrato v2.3.7: { number, text } no topo. `number` = número (dígitos)
          // para pessoa, ou o jid inteiro (…@g.us) para grupo — ver send-command.ts.
          body: JSON.stringify({ number, text }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.name : "erro de rede";
        throw new EvolutionSendError(0, reason);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new EvolutionSendError(response.status, safeDetail(body));
      }
    },
  };
}
