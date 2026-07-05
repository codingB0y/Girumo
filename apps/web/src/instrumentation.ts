/**
 * Next.js Instrumentation — executa uma vez na inicialização do server.
 * Ref: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Aqui validamos variáveis de ambiente e executamos security guards.
 */

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
}
