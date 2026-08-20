/**
 * Cliente HTTP do app web, autenticado como ENGINE.
 *
 * Porte direto do `appFetch` de `hubflow-engine/index.js`: mesma base URL, mesmos
 * dois headers (`x-engine-token` + `x-tenant-id`), mesmo contrato de rota. O que
 * muda é só quem chama — era a engine Baileys, agora é o worker.
 *
 * Por que o worker fala HTTP em vez de ir ao banco: as decisões do auto-grow
 * (quando enfileirar, e o que fazer no ack — registrar o grupo no pool e inserir
 * o JID no `group_ids` da campanha) vivem em `group-grow-store.ts`, que é
 * `server-only` e portanto não importável daqui. Reimplementar aqui duplicaria o
 * gate provado no PR #90 e criaria duas verdades sobre a mesma fila.
 *
 * O token é credencial de acesso a qualquer tenant (a rota confia no
 * `x-tenant-id` depois de validá-lo) — nunca é logado.
 */

export class AppRequestError extends Error {
  /** 0 = não chegou no app (timeout/rede); senão o HTTP status. */
  readonly status: number;

  constructor(status: number, path: string, detail?: string) {
    super(`app ${path} falhou (${status})${detail ? `: ${detail}` : ""}`);
    this.name = "AppRequestError";
    this.status = status;
  }
}

export interface AppClient {
  post<T>(tenantId: string, path: string, body?: unknown): Promise<T>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type AppClientConfig = {
  baseUrl: string;
  engineToken: string;
  timeoutMs?: number;
  /** Injetável para teste (sem rede). */
  fetchImpl?: FetchLike;
};

const DEFAULT_TIMEOUT_MS = 20_000;

/** Trecho curto do corpo de erro — a resposta do app pode conter dados do tenant. */
function safeDetail(body: string): string {
  return body.slice(0, 200);
}

export function createAppClient(config: AppClientConfig): AppClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const doFetch: FetchLike = config.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async post<T>(tenantId: string, path: string, body?: unknown): Promise<T> {
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: {
            "x-engine-token": config.engineToken,
            "x-tenant-id": tenantId,
            "Content-Type": "application/json",
          },
          // Sem corpo, `pending` recebe `undefined` e o app não tenta ler JSON.
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.name : "erro de rede";
        throw new AppRequestError(0, path, reason);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new AppRequestError(response.status, path, safeDetail(detail));
      }

      return (await response.json()) as T;
    },
  };
}
