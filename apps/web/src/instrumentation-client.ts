/**
 * Coletor de erros no browser.
 *
 * Existe separado do `instrumentation.ts` porque o Next carrega este arquivo no
 * cliente — é ele que pega a classe de defeito que hoje é INVISÍVEL: tela
 * branca, erro de hidratação, exceção em `onClick`. Nada disso aparece em log
 * de servidor, e o lojista não abre o console para reclamar; ele só some.
 *
 * Sem DSN o SDK nem é carregado, então o bundle de quem não configurou não
 * muda.
 *
 * NAS TELAS DE AUTENTICAÇÃO O SDK NÃO CARREGA NA ABERTURA. O motivo, medido em
 * produção em 29/08 (visita fria, Slow 4G, `/login`): 468 KB de JavaScript, dos
 * quais 187 KB eram este SDK — 41% do total — e o maior pedaço dele era o
 * ÚLTIMO recurso a terminar, aos 6036 ms. O coletor de erros estava definindo o
 * tempo de carga da tela de entrada, e antes de hidratar o formulário fica
 * visível e inerte: o lojista clica em "Entrar" e nada acontece.
 *
 * A cobertura NÃO é perdida: quem sai de `/login` para `/painel` dispara
 * `onRouterTransitionStart`, e é lá que o SDK sobe. O que se abre mão é da
 * janela entre abrir a tela de login e sair dela — segundos, num formulário de
 * dois campos, sem sessão e sem dado do lojista.
 */

import { isAuthPage } from "@/lib/public-pages";
import { resolveSentryDsn, scrubEvent, tracesSampleRate } from "@/lib/observability/sentry-options";

const dsn = resolveSentryDsn({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

type ModuloSentry = typeof import("@sentry/nextjs");

/**
 * Guarda a PROMESSA, não um booleano.
 *
 * Duas navegações quase simultâneas chamariam `garantirSentry` antes de a
 * primeira terminar o `import`; com flag booleana as duas veriam `false` e
 * chamariam `Sentry.init` duas vezes. Reaproveitar a promessa faz o `init`
 * acontecer uma vez só, sem precisar de trava.
 */
let carregando: Promise<ModuloSentry> | null = null;

function garantirSentry(): Promise<ModuloSentry> | null {
  if (!dsn) return null;
  if (carregando) return carregando;

  carregando = import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: tracesSampleRate(),
      sendDefaultPii: false,
      beforeSend: (event) => scrubEvent(event),
    });
    return Sentry;
  });

  return carregando;
}

/**
 * Extrai o caminho de um destino de navegação.
 *
 * O href do App Router chega ora relativo (`/painel`), ora absoluto. Nunca
 * lança: se não der para interpretar, devolve `null` e quem chama trata como
 * "não sei" — e a decisão segura para "não sei" é CARREGAR o SDK, porque perder
 * telemetria é pior que carregá-la a mais.
 */
function caminhoDe(href: string): string | null {
  try {
    return new URL(href, window.location.origin).pathname;
  } catch {
    return null;
  }
}

// Abertura direta: só sobe o SDK fora das telas de autenticação.
if (dsn && !isAuthPage(window.location.pathname)) {
  void garantirSentry();
}

/**
 * Instrumentação de navegação do App Router. O Next chama este hook a cada
 * troca de rota; sem ele o SDK não sabe agrupar erro por página.
 *
 * É também o ponto que recupera a cobertura pulada na abertura: a primeira
 * navegação para fora de uma tela de autenticação carrega o SDK.
 */
export async function onRouterTransitionStart(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRouterTransitionStart>
) {
  if (!dsn) return;

  const destino = caminhoDe(args[0]);
  // Navegação entre telas de autenticação (login → cadastro → esqueci) não
  // justifica subir 187 KB. Só vale enquanto o SDK ainda não subiu: uma vez
  // carregado, registrar a transição não custa rede nenhuma.
  if (!carregando && destino !== null && isAuthPage(destino)) return;

  const Sentry = await garantirSentry();
  Sentry?.captureRouterTransitionStart(...args);
}
