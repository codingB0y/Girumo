/**
 * Opções compartilhadas do Sentry — a parte que dá para testar.
 *
 * O SDK em si só é inicializado em `instrumentation.ts` (servidor e edge) e
 * `instrumentation-client.ts` (browser). O que mora aqui é a decisão de LIGAR e
 * a higiene do que sai daqui para fora, porque essas duas coisas erradas custam
 * caro e são invisíveis: um SDK que exige configuração derruba o app inteiro, e
 * um payload sem filtro transforma o coletor de erros em exfiltração de
 * credencial — o relatório de um 500 carrega a request inteira, com cookie de
 * sessão e header de autorização.
 */

/**
 * Host liberado no `connect-src` das políticas de CSP.
 *
 * Constante compartilhada de propósito: se o CSP não cobrir o Sentry, o SDK do
 * browser falha EM SILÊNCIO — o erro acontece, o relatório nunca sai, e a
 * ausência de alerta é lida como "não há erros". Curinga em `*.sentry.io` para
 * cobrir a região de ingest que a conta usar (`us`, `de`, …) sem exigir que
 * quem cria o projeto lá saiba disso.
 */
export const SENTRY_CSP_HOST = "https://*.sentry.io";

/** Campos que nunca podem sair da nossa infraestrutura. */
const CHAVES_SENSIVEIS =
  /^(authorization|cookie|set-cookie|x-engine-token|password|senha|token|secret|apikey|api_key|access_token|refresh_token|.*secret.*|.*token.*)$/i;

const FILTRADO = "[Filtrado]";

type Registro = Record<string, unknown>;

function ehRegistro(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * DSN do Sentry, ou `null` quando não configurado.
 *
 * `NEXT_PUBLIC_` primeiro porque o DSN é público por natureza — ele vai no
 * bundle do browser de qualquer jeito. `SENTRY_DSN` é aceito como alternativa
 * para quem configurar só o lado servidor.
 */
export function resolveSentryDsn(env: Record<string, string | undefined>): string | null {
  const bruto = env.NEXT_PUBLIC_SENTRY_DSN ?? env.SENTRY_DSN ?? "";
  const dsn = bruto.trim();
  return dsn === "" ? null : dsn;
}

/**
 * Taxa de amostragem de performance.
 *
 * O plano free do Sentry dá 5k eventos/mês. Tracing a 100% queima a cota em
 * dias, e quando ela acaba os ERROS param de chegar — que é justamente o que
 * este trabalho veio resolver. Em desenvolvimento fica desligado: ninguém
 * depura performance de localhost por telemetria remota.
 */
export function tracesSampleRate(nodeEnv: string | undefined): number {
  return nodeEnv === "production" ? 0.1 : 0;
}

/**
 * Remove segredo do evento antes de ele sair.
 *
 * Nunca lança: roda dentro de `beforeSend`, no caminho de erro. Se este código
 * estourar, o erro original some — e o coletor vira o motivo de não enxergar os
 * defeitos.
 */
export function scrubEvent<T>(evento: T): T {
  try {
    const raiz = evento as unknown;
    if (!ehRegistro(raiz)) return evento;

    const request = raiz.request;
    if (ehRegistro(request)) {
      // Cookies vão inteiros: não há cookie nosso que ajude a depurar, e o de
      // sessão dá acesso à conta de quem sofreu o erro.
      delete request.cookies;
      filtrarRegistro(request.headers);
      filtrarRegistro(request.data);
    }

    filtrarRegistro(raiz.extra);
    filtrarRegistro(raiz.contexts);

    return evento;
  } catch {
    return evento;
  }
}

/** Substitui in-place os valores de chave sensível. Ignora o que não for objeto. */
function filtrarRegistro(alvo: unknown): void {
  if (!ehRegistro(alvo)) return;
  for (const [chave, valor] of Object.entries(alvo)) {
    if (CHAVES_SENSIVEIS.test(chave)) {
      alvo[chave] = FILTRADO;
      continue;
    }
    if (ehRegistro(valor)) filtrarRegistro(valor);
  }
}
