/**
 * Next.js Instrumentation — executa uma vez na inicialização do server.
 * Ref: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Aqui validamos variáveis de ambiente e executamos security guards.
 */

export async function register() {
  // Só executa no server (não no edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { enforceEnvironmentValidation } = await import("./lib/env-validator");
    enforceEnvironmentValidation();

    const { logSecurityStatus } = await import("./lib/security-guards");
    logSecurityStatus();
  }
}
