import "server-only";

import { getAppEnvironment, isDev, isDevToolsEnabled } from "./environment";

/**
 * Guard para rotas que só devem funcionar em DEV.
 * Uso: chamar no início de API routes dev-only.
 *
 * Retorna { allowed: true } ou { allowed: false, reason: string }
 */
export function requireDevEnvironment(): { allowed: boolean; reason?: string } {
  if (!isDev()) {
    return {
      allowed: false,
      reason: `Bloqueado: esta rota só funciona em development. Ambiente atual: ${getAppEnvironment()}`,
    };
  }

  if (!isDevToolsEnabled()) {
    return {
      allowed: false,
      reason: "Dev tools não estão habilitados (ENABLE_DEV_TOOLS !== true)",
    };
  }

  return { allowed: true };
}

/**
 * Verifica se o email é um admin dev válido.
 * Previne que credenciais dev (@localhost.dev) sejam usadas em produção.
 */
export function isDevAdminEmail(email: string): boolean {
  return email.endsWith("@localhost.dev") || email.endsWith("@dev.local") || email.endsWith("@test.local");
}

/**
 * Bloqueia login com credenciais dev em produção.
 * Chamar antes de autenticar.
 */
export function blockDevCredentialsInProduction(email: string): { blocked: boolean; reason?: string } {
  if (isDev()) return { blocked: false };

  if (isDevAdminEmail(email)) {
    return {
      blocked: true,
      reason: `Credencial dev (${email}) bloqueada fora do ambiente development.`,
    };
  }

  return { blocked: false };
}
