import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-guard";
import { runSecurityChecks } from "@/lib/security-guards";
import { validateEnvironment } from "@/lib/env-validator";
import { isDev } from "@/lib/environment";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dev-tools/security-check
 * Executa todos os security guards e retorna relatório.
 * ⚠️  Apenas em development.
 */
export async function GET() {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDev()) {
    return NextResponse.json({ error: "Apenas em development" }, { status: 403 });
  }

  const securityResult = runSecurityChecks();
  const envResult = validateEnvironment();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: securityResult.environment,
    isolated: securityResult.safe && envResult.valid,
    security: {
      safe: securityResult.safe,
      violations: securityResult.violations,
    },
    envValidation: {
      valid: envResult.valid,
      errors: envResult.errors,
      warnings: envResult.warnings,
    },
    checklist: {
      stripeIsolated: !process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_"),
      engineIsolated: process.env.ENGINE_MODE === "mock" || !process.env.ENGINE_URL?.includes("hubflow.com"),
      databaseSeparated: !process.env.PRODUCTION_SUPABASE_REF || !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(process.env.PRODUCTION_SUPABASE_REF),
      domainLocal: (process.env.NEXT_PUBLIC_APP_URL || "").includes("localhost"),
      devToolsEnabled: process.env.ENABLE_DEV_TOOLS === "true",
      mockEngineEnabled: process.env.ENABLE_MOCK_ENGINE === "true",
      productionBlocked: process.env.BLOCK_PRODUCTION_CONNECTIONS === "true",
    },
  });
}
