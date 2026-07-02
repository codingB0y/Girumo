/**
 * Environment Validator — executa na inicialização do app.
 * Bloqueia mistura de ambientes e interrompe se configuração inválida.
 *
 * Importar em: next.config.ts ou layout.tsx (server-side)
 */

import { getAppEnvironment, isDev, detectProductionLeaks } from "./environment";

export interface EnvValidationResult {
  valid: boolean;
  environment: string;
  errors: string[];
  warnings: string[];
}

/** Variáveis obrigatórias por ambiente */
const REQUIRED_VARS: Record<string, string[]> = {
  common: [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ],
  development: [
    "NEXT_PUBLIC_APP_ENV",
  ],
  staging: [
    "NEXT_PUBLIC_APP_ENV",
    "STRIPE_SECRET_KEY",
  ],
  production: [
    "NEXT_PUBLIC_APP_ENV",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "AUTH_SECRET",
    "ENGINE_TOKEN",
  ],
};

/** Patterns proibidos por ambiente */
const FORBIDDEN_PATTERNS: Record<string, Array<{ var: string; pattern: RegExp; message: string }>> = {
  development: [
    {
      var: "STRIPE_SECRET_KEY",
      pattern: /^sk_live_/,
      message: "Chave Stripe LIVE detectada em ambiente DEV — use sk_test_",
    },
    {
      var: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      pattern: /^pk_live_/,
      message: "Chave Stripe PK LIVE detectada em ambiente DEV — use pk_test_",
    },
    {
      var: "ENGINE_MODE",
      pattern: /^production$/,
      message: "ENGINE_MODE=production em ambiente DEV — use mock ou development",
    },
  ],
  staging: [
    {
      var: "STRIPE_SECRET_KEY",
      pattern: /^sk_live_/,
      message: "Chave Stripe LIVE detectada em STAGING — use sk_test_",
    },
  ],
  production: [
    {
      var: "STRIPE_SECRET_KEY",
      pattern: /^sk_test_/,
      message: "Chave Stripe TEST detectada em PRODUCTION — use sk_live_",
    },
    {
      var: "ENABLE_DEV_TOOLS",
      pattern: /^true$/,
      message: "DEV_TOOLS habilitado em PRODUCTION — desabilite imediatamente",
    },
    {
      var: "ENABLE_MOCK_ENGINE",
      pattern: /^true$/,
      message: "MOCK_ENGINE habilitado em PRODUCTION — desabilite imediatamente",
    },
  ],
};

/**
 * Valida todas as variáveis de ambiente.
 * Retorna resultado com erros e warnings.
 */
export function validateEnvironment(): EnvValidationResult {
  const env = getAppEnvironment();
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Checar variáveis obrigatórias
  const requiredVars = [...REQUIRED_VARS.common, ...(REQUIRED_VARS[env] || [])];
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value || value.includes("SEU-PROJETO") || value.includes("XXXXXXX")) {
      errors.push(`Variável obrigatória não configurada: ${varName}`);
    }
  }

  // 2. Checar patterns proibidos
  const forbidden = FORBIDDEN_PATTERNS[env] || [];
  for (const rule of forbidden) {
    const value = process.env[rule.var];
    if (value && rule.pattern.test(value)) {
      errors.push(`[BLOQUEADO] ${rule.message}`);
    }
  }

  // 3. Detectar leaks de produção em DEV
  if (isDev()) {
    const leaks = detectProductionLeaks();
    for (const leak of leaks) {
      errors.push(`[LEAK] ${leak}`);
    }
  }

  // 4. Warnings (não bloqueiam, mas avisam)
  if (isDev() && !process.env.ENABLE_DEV_TOOLS) {
    warnings.push("ENABLE_DEV_TOOLS não está definido — dev tools desabilitados");
  }

  if (env === "development" && process.env.AUTH_SECRET === "dev-secret-local-troque-em-producao") {
    warnings.push("AUTH_SECRET está com valor default — ok para dev, troque em staging/prod");
  }

  return {
    valid: errors.length === 0,
    environment: env,
    errors,
    warnings,
  };
}

/**
 * Executa validação e interrompe inicialização se inválido.
 * Chamar em instrumentation.ts ou no topo de next.config.ts
 */
export function enforceEnvironmentValidation(): void {
  const result = validateEnvironment();

  // Sempre logar ambiente
  console.log(`\n🌍 HubFlow Environment: ${result.environment.toUpperCase()}`);

  // Logar warnings
  for (const warning of result.warnings) {
    console.warn(`  ⚠️  ${warning}`);
  }

  // Se inválido, listar erros e abortar
  if (!result.valid) {
    console.error("\n❌ VALIDAÇÃO DE AMBIENTE FALHOU:");
    for (const error of result.errors) {
      console.error(`  ✗ ${error}`);
    }
    console.error("\n🛑 Inicialização interrompida. Corrija as variáveis acima.\n");

    // Em produção, interrompe. Em dev, apenas avisa (para não travar setup inicial)
    if (result.environment === "production") {
      process.exit(1);
    }
  } else {
    console.log("  ✓ Todas as variáveis validadas\n");
  }
}
