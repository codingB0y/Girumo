// Erros da Evolution e classificacao de falha.
//
// Sem `server-only` DE PROPOSITO: `client.ts` tem, e isso impede `tsx --test`
// de importar qualquer coisa dele. A classe de erro e a regra que decide o que
// dizer ao lojista nao precisam de servidor — e precisam de teste.

/**
 * Teto do `fetchAllGroups`.
 *
 * 50s, e NAO 60s: a rota que o chama roda com `maxDuration = 60` (o teto do
 * plano). Com os dois iguais, a Vercel matava a funcao ANTES de o fetch
 * desistir — o lojista via um 504 mudo, nada era gravado em `logs`, e o
 * diagnostico so existia no painel da Vercel. Os 10s de folga sao o que
 * transformam "demorou demais" num erro tratado, com registro.
 */
export const FETCH_GROUPS_TIMEOUT_MS = 50_000;

/**
 * A falha foi o tempo acabar, e não a Evolution responder erro?
 *
 * `status === 0` é como `request` sinaliza "não chegou na Evolution", e o
 * `detail` carrega o nome do erro — `TimeoutError` vem do `AbortSignal.timeout`.
 * Separar os dois casos importa porque a orientação ao lojista é oposta:
 * timeout é "tente de novo", erro da Evolution é "algo está errado".
 */
export function isEvolutionTimeout(error: unknown): boolean {
  return (
    error instanceof EvolutionError && error.status === 0 && error.detail === "TimeoutError"
  );
}

export class EvolutionError extends Error {
  readonly status: number;
  readonly path: string;
  /**
   * Detail cru do provedor, separado da `message` composta.
   *
   * A message carrega path e status — útil em log, péssimo em tela: quem
   * classifica a falha (ver `classifyInviteFailure`) e grava o motivo que o
   * lojista lê no painel precisa só desta parte.
   */
  readonly detail: string | undefined;

  constructor(path: string, status: number, detail?: string) {
    super(`Evolution ${path} falhou (${status})${detail ? `: ${detail}` : ""}`);
    this.name = "EvolutionError";
    this.status = status;
    this.path = path;
    this.detail = detail;
  }
}
