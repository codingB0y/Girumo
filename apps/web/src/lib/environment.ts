/**
 * Environment management — enum, guards, and helpers.
 * Garante isolamento completo entre DEV, STAGING e PRODUCTION.
 */

export type AppEnvironment = "development" | "staging" | "production";

/**
 * Detecta o ambiente atual baseado em NEXT_PUBLIC_APP_ENV.
 * Fallback: NODE_ENV → development
 */
export function getAppEnvironment(): AppEnvironment {
  const env = process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV;

  switch (env) {
    case "production":
      return "production";
    case "staging":
      return "staging";
    default:
      return "development";
  }
}
/** True se estamos em ambiente local de desenvolvimento */
export function isDev(): boolean {
  return getAppEnvironment() === "development";
}

/** True se estamos em produção */
export function isProduction(): boolean {
  return getAppEnvironment() === "production";
}

/**
 * Guard: bloqueia execução se estiver em produção.
 * Uso: chamar antes de ações destrutivas (reset, seed, etc.)
 */
export function blockInProduction(action: string): void {
  if (isProduction()) {
    throw new Error(
      `[SECURITY] Ação bloqueada em produção: "${action}". ` +
        `Ambiente atual: ${getAppEnvironment()}`
    );
  }
}

/**
 * Guard: bloqueia se credenciais de produção forem detectadas em DEV.
 * Verifica patterns como sk_live_, domínios de produção, etc.
 */
export function detectProductionLeaks(): string[] {
  const leaks: string[] = [];

  if (!isDev()) return leaks;

  // Stripe live keys em DEV
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    leaks.push("STRIPE_SECRET_KEY contém chave LIVE em ambiente DEV");
  }
  if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_")) {
    leaks.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY contém chave LIVE em ambiente DEV");
  }

  // Domínio de produção em DEV
  const prodDomains = ["app.hubflow.com.br", "hubflow.com.br"];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  for (const domain of prodDomains) {
    if (appUrl.includes(domain)) {
      leaks.push(`NEXT_PUBLIC_APP_URL aponta para domínio de produção: ${domain}`);
    }
  }

  // Supabase de produção em DEV (se tiver um ref conhecido)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const prodSupabaseRefs = process.env.PRODUCTION_SUPABASE_REF?.split(",") || [];
  for (const ref of prodSupabaseRefs) {
    if (ref && supabaseUrl.includes(ref)) {
      leaks.push(`NEXT_PUBLIC_SUPABASE_URL aponta para projeto Supabase de produção: ${ref}`);
    }
  }

  return leaks;
}
