/**
 * Leitura do 402 do gate de plano, do lado do cliente.
 *
 * Existe porque o padrão nasceu dentro de `campaign-config.tsx` (PR #152) e
 * ficou só lá: das cinco superfícies que batem em `assertPlanLimit` — criar
 * campanha, disparar, agendar mensagem, conectar número e convidar equipe —
 * apenas a primeira mostrava o caminho para assinar. Nas outras o cliente lia
 * "não inclui X" e ficava sem saber o que fazer, ou via um `alert()` nativo,
 * onde link nem cabe.
 *
 * Isso importa mais aqui do que num produto qualquer: sem trial, o paywall é o
 * único momento de conversão. Um bloqueio sem saída é uma venda perdida no
 * exato instante em que o cliente decidiu que queria usar.
 */

/** Erro que preserva o caminho de saída, além da mensagem. */
export class PlanLimitError extends Error {
  readonly upgradeUrl: string | null;
  readonly code: string | null;

  constructor(message: string, upgradeUrl: string | null, code: string | null) {
    super(message);
    this.name = "PlanLimitError";
    this.upgradeUrl = upgradeUrl;
    this.code = code;
  }
}

/**
 * Converte uma resposta de erro em `PlanLimitError`.
 *
 * `res.json().catch(() => ({}))` é o mesmo padrão que toda tela do painel já
 * usava — e é justamente por causa dele que o gate precisou passar a responder
 * JSON em vez de `text/plain`: com texto cru o parse estourava, o corpo virava
 * `{}` e a mensagem do plano nunca chegava na tela.
 */
export async function toPlanLimitError(res: Response, fallback: string): Promise<PlanLimitError> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    upgradeUrl?: string;
    code?: string;
  };
  return new PlanLimitError(body?.error ?? fallback, body?.upgradeUrl ?? null, body?.code ?? null);
}

/** O `upgradeUrl` de um erro, quando ele for de plano. Senão, `null`. */
export function upgradeUrlFrom(erro: unknown): string | null {
  return erro instanceof PlanLimitError ? erro.upgradeUrl : null;
}
