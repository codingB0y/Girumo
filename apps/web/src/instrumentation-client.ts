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
 */

import { resolveSentryDsn, scrubEvent, tracesSampleRate } from "@/lib/observability/sentry-options";

const dsn = resolveSentryDsn({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: tracesSampleRate(process.env.NODE_ENV),
      sendDefaultPii: false,
      beforeSend: (event) => scrubEvent(event),
    });
  });
}

/**
 * Instrumentação de navegação do App Router. O Next chama este hook a cada
 * troca de rota; sem ele o SDK não sabe agrupar erro por página.
 */
export async function onRouterTransitionStart(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRouterTransitionStart>
) {
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRouterTransitionStart(...args);
}
