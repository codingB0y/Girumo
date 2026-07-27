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
    "CRON_SECRET",
    // Evolution API: a partir da F2 o lifecycle de instância depende delas.
    // Sem APP_URL não há como registrar o webhook (a VPS precisa de uma URL
    // pública alcançável — req.url não serve atrás de proxy/preview).
    "NEXT_PUBLIC_APP_URL",
    "EVOLUTION_API_URL",
    "EVOLUTION_API_KEY",
    "EVOLUTION_WEBHOOK_SECRET",
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

  if (env === "development" && process.env.AUTH_SECRET === "dz-dev-secret-troque-em-producao") {
    warnings.push("AUTH_SECRET está com valor default — ok para dev, troque em staging/prod");
  }

  if (!process.env.ENGINE_TOKEN) {
    warnings.push(
      "ENGINE_TOKEN não definido — rotas da engine ficam fail-closed (nenhum request da engine autentica)",
    );
  }

  // Fora de produção as envs da Evolution são opcionais, mas config PARCIAL é
  // sempre inválida — ou tudo ou nada.
  const evolutionVars = ["EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_WEBHOOK_SECRET"];
  const missingEvolution = evolutionVars.filter((name) => !process.env[name]);
  if (missingEvolution.length > 0 && missingEvolution.length < evolutionVars.length) {
    warnings.push(`Config Evolution API incompleta — faltam: ${missingEvolution.join(", ")}`);
  }

  // Um secret curto derrota o ponto do compare constant-time no receiver.
  const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (webhookSecret && webhookSecret.length < 32) {
    warnings.push("EVOLUTION_WEBHOOK_SECRET tem menos de 32 caracteres — gere um segredo mais forte");
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
  console.log(`\n🌍 Girumo Environment: ${result.environment.toUpperCase()}`);

  // Logar warnings
  for (const warning of result.warnings) {
    console.warn(`  ⚠️  ${warning}`);
  }

  // Se inválido, listar erros — mas NÃO derrubar o processo por padrão.
  // Um process.exit(1) aqui transforma "config incompleta" em OUTAGE TOTAL: toda
  // rota server-side passa a responder 500 (login/signup inclusive). Logamos em
  // vermelho e seguimos. Quem quiser o comportamento fail-closed pode setar
  // ENV_VALIDATION_STRICT=true DEPOIS de garantir que o ambiente está completo.
  if (!result.valid) {
    console.error("\n❌ VALIDAÇÃO DE AMBIENTE FALHOU:");
    for (const error of result.errors) {
      console.error(`  ✗ ${error}`);
    }

    if (process.env.ENV_VALIDATION_STRICT === "true") {
      console.error("\n🛑 ENV_VALIDATION_STRICT=true — inicialização interrompida.\n");
      process.exit(1);
    }

    console.error("\n⚠️  Seguindo mesmo assim (config incompleta). Corrija as variáveis acima.\n");
  } else {
    console.log("  ✓ Todas as variáveis validadas\n");
  }
}
