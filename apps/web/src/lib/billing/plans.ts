import "server-only";

// Reexportado para quem ja importava daqui. A definicao mora em plan-codes.ts,
// que nao tem "server-only" e por isso roda sob `tsx --test`.
export { FREE_PLAN_CODE, normalizePlanCode, SEED_PLAN_CATALOG } from "./plan-codes";

export const PLAN_PRICE_ENV: Record<string, string> = {
  ESSENCIAL: "STRIPE_PRICE_ESSENCIAL",
  GROWTH: "STRIPE_PRICE_GROWTH",
  PERFORMANCE_MAX: "STRIPE_PRICE_PERFORMANCE_MAX",
};

export function getStripePriceId(planCode: string): string | null {
  const envName = PLAN_PRICE_ENV[planCode];
  if (!envName) return null;
  return process.env[envName] || null;
}

