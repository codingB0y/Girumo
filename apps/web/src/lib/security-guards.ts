import "server-only";

import { getAppEnvironment, isDev, isProduction } from "./environment";

/**
 * Security Guards — isolamento total entre ambientes.
 *
 * Bloqueia:
 * - Stripe produção em DEV
 * - WhatsApp produção em DEV
 * - Banco produção em DEV
 * - Storage produção em DEV
 * - Domínio produção em DEV
 */

export type SecurityCheckResult = {
  safe: boolean;
  violations: string[];
  environment: string;
};

// ====================================
// STRIPE GUARD
// ====================================

/**
 * Bloqueia uso de chaves Stripe live em ambientes não-produção.
 * Deve ser chamado antes de qualquer operação Stripe.
 */
export function guardStripe(): { allowed: boolean; reason?: string } {
  const key = process.env.STRIPE_SECRET_KEY || "";
  const env = getAppEnvironment();

  // Em produção, deve ter sk_live_
  if (isProduction() && key.startsWith("sk_test_")) {
    return { allowed: false, reason: "Chave Stripe TEST em produção — configure sk_live_" };
  }

  // Em dev/staging, NUNCA sk_live_
  if (!isProduction() && key.startsWith("sk_live_")) {
    return {
      allowed: false,
      reason: `Chave Stripe LIVE detectada em ${env}. Use sk_test_ para ambientes não-produção.`,
    };
  }

  return { allowed: true };
}

// ====================================
// WHATSAPP / ENGINE GUARD
// ====================================

/**
 * Bloqueia conexão com engine de produção em DEV.
 */
function guardEngine(): { allowed: boolean; reason?: string } {
  const engineUrl = process.env.ENGINE_URL || "";
  const engineMode = process.env.ENGINE_MODE || "";
  const env = getAppEnvironment();

  // Patterns de produção
  const prodPatterns = [
    "engine.hubflow.com",
    "engine-prod",
    "api.hubflow.com",
  ];

  if (!isProduction()) {
    for (const pattern of prodPatterns) {
      if (engineUrl.includes(pattern)) {
        return {
          allowed: false,
          reason: `ENGINE_URL aponta para produção (${pattern}) em ambiente ${env}. Use localhost ou engine-staging.`,
        };
      }
    }

    if (engineMode === "production") {
      return {
        allowed: false,
        reason: `ENGINE_MODE=production em ambiente ${env}. Use mock ou development.`,
      };
    }
  }

  return { allowed: true };
}

// ====================================
// DATABASE / SUPABASE GUARD
// ====================================

/**
 * Bloqueia conexão com Supabase de produção em DEV.
 * Requer PRODUCTION_SUPABASE_REF definido para funcionar.
 */
function guardDatabase(): { allowed: boolean; reason?: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const env = getAppEnvironment();

  // Refs conhecidos de produção (definir na env como segurança extra)
  const prodRefs = (process.env.PRODUCTION_SUPABASE_REF || "").split(",").filter(Boolean);

  if (!isProduction()) {
    for (const ref of prodRefs) {
      if (supabaseUrl.includes(ref)) {
        return {
          allowed: false,
          reason: `Supabase URL contém ref de produção (${ref}) em ambiente ${env}. Use projeto DEV.`,
        };
      }
    }
  }

  // Se estiver em dev e a URL não contiver "localhost" ou padrão de dev
  if (isDev() && process.env.BLOCK_PRODUCTION_CONNECTIONS === "true") {
    const safePatterns = ["localhost", "127.0.0.1", "dev", "staging", "test"];
    const isSafe = safePatterns.some((p) => supabaseUrl.includes(p));

    // Se não bate com nenhum pattern seguro, é warning (não block)
    if (!isSafe && prodRefs.length > 0) {
      // Só bloqueia se temos refs de produção configurados
      return {
        allowed: false,
        reason: `Supabase URL não parece ser de dev e BLOCK_PRODUCTION_CONNECTIONS=true.`,
      };
    }
  }

  return { allowed: true };
}

// ====================================
// STORAGE GUARD
// ====================================

/**
 * Bloqueia uso de storage de produção em DEV.
 * O Supabase Storage usa o mesmo projeto — se guardDatabase() passa, este também.
 */
function guardStorage(): { allowed: boolean; reason?: string } {
  // Storage usa mesmo projeto que o banco
  return guardDatabase();
}

// ====================================
// DOMAIN GUARD
// ====================================

/**
 * Bloqueia se a URL da app aponta para domínio de produção em DEV.
 */
function guardDomain(): { allowed: boolean; reason?: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const env = getAppEnvironment();

  const prodDomains = [
    "app.hubflow.com.br",
    "hubflow.com.br",
    "www.hubflow.com.br",
  ];

  if (!isProduction()) {
    for (const domain of prodDomains) {
      if (appUrl.includes(domain)) {
        return {
          allowed: false,
          reason: `NEXT_PUBLIC_APP_URL aponta para ${domain} em ambiente ${env}. Use localhost ou domínio staging.`,
        };
      }
    }
  }

  return { allowed: true };
}

// ====================================
// RUN ALL GUARDS
// ====================================

/**
 * Executa TODOS os guards de segurança.
 * Retorna resultado consolidado.
 */
export function runSecurityChecks(): SecurityCheckResult {
  const violations: string[] = [];
  const env = getAppEnvironment();

  const guards = [
    { name: "Stripe", check: guardStripe },
    { name: "Engine/WhatsApp", check: guardEngine },
    { name: "Database", check: guardDatabase },
    { name: "Storage", check: guardStorage },
    { name: "Domain", check: guardDomain },
  ];

  for (const guard of guards) {
    const result = guard.check();
    if (!result.allowed) {
      violations.push(`[${guard.name}] ${result.reason}`);
    }
  }

  return {
    safe: violations.length === 0,
    violations,
    environment: env,
  };
}

/**
 * Executa guards e loga resultado. Não bloqueia — apenas avisa.
 * Chamar na inicialização (instrumentation.ts).
 */
export function logSecurityStatus(): void {
  const result = runSecurityChecks();

  if (result.safe) {
    console.log(`  🔒 Security guards: OK (${result.environment})`);
  } else {
    console.warn(`\n⚠️  SECURITY WARNINGS (${result.environment}):`);
    for (const v of result.violations) {
      console.warn(`  ⚠️  ${v}`);
    }
    console.warn("");
  }
}
