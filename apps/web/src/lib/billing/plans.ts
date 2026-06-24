import "server-only";

export const PLAN_PRICE_ENV: Record<string, string> = {
  ESSENCIAL: "STRIPE_PRICE_ESSENCIAL",
  GROWTH: "STRIPE_PRICE_GROWTH",
  PERFORMANCE_MAX: "STRIPE_PRICE_PERFORMANCE_MAX",
};

export function normalizePlanCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function getStripePriceId(planCode: string): string | null {
  const envName = PLAN_PRICE_ENV[planCode];
  if (!envName) return null;
  return process.env[envName] || null;
}

