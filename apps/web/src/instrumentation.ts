/**
 * Next.js Instrumentation — executa uma vez na inicialização do server.
 * Ref: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Aqui validamos variáveis de ambiente, executamos security guards e ligamos o
 * coletor de erros.
 */

import type { Instrumentation } from "next";

import { resolveSentryDsn, scrubEvent, tracesSampleRate } from "./lib/observability/sentry-options";

export async function register() {
  // Só executa no server (não no edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resolveSecret } = await import("./lib/runtime-secrets");
    resolveSecret("AUTH_SECRET", process.env.AUTH_SECRET, process.env.NODE_ENV, "dev-auth-secret");
    resolveSecret("ENGINE_TOKEN", process.env.ENGINE_TOKEN, process.env.NODE_ENV, "dev-engine-token");
    resolveSecret("CRON_SECRET", process.env.CRON_SECRET, process.env.NODE_ENV, "dev-cron-secret");

    const { enforceEnvironmentValidation } = await import("./lib/env-validator");
    enforceEnvironmentValidation();

    const { logSecurityStatus } = await import("./lib/security-guards");
    logSecurityStatus();
  }

  // Coletor de erros. Sem DSN não carrega o SDK sequer — o `import()` fica de
  // fora do caminho, e o app roda idêntico ao que rodava antes. Isso vale para
  // dev, para o CI e para produção enquanto o projeto no Sentry não existir:
  // observabilidade que derruba o app quando não está configurada é pior que
  // não ter observabilidade.
  const dsn = resolveSentryDsn(process.env);
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: tracesSampleRate(),
      // O padrão do SDK já é `false`; explícito porque aqui é decisão, não
      // default herdado: dado de titular só sai daqui se alguém escrever que
      // deve sair, e a Política de Privacidade lista o Sentry como operador.
      sendDefaultPii: false,
      beforeSend: (event) => scrubEvent(event),
    });
  }
}

/**
 * Erros de Server Component e de route handler chegam por aqui.
 *
 * Sem este hook, o `register()` acima só cobriria o que o SDK instrumenta
 * sozinho — e justamente os erros de render no servidor, que hoje viram tela de
 * erro sem rastro nenhum, ficariam de fora.
 */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!resolveSentryDsn(process.env)) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
