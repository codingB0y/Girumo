import { getSupabaseAdmin } from "@/lib/supabase/server";
import { PLAN_PRICE_ENV } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasEnv(name: string) {
  return Boolean(process.env[name]);
}

export async function GET() {
  const checks = {
    appUrl: hasEnv("NEXT_PUBLIC_APP_URL"),
    salesWhatsappUrl: hasEnv("NEXT_PUBLIC_SALES_WHATSAPP_URL"),
    authSecret: hasEnv("AUTH_SECRET"),
    supabasePublicUrl: hasEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabasePublicAnon: hasEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseUrl: hasEnv("SUPABASE_URL"),
    supabaseServiceRole: hasEnv("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseAnon: hasEnv("SUPABASE_ANON_KEY"),
    stripeSecret: hasEnv("STRIPE_SECRET_KEY"),
    stripeWebhook: hasEnv("STRIPE_WEBHOOK_SECRET"),
    stripePublishable: hasEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
    engineToken: hasEnv("ENGINE_TOKEN"),
  };

  let database: "ok" | "degraded" = "degraded";
  let databaseError: string | null = null;
  let planCount = 0;
  let storage: "ok" | "degraded" = "degraded";
  let storageError: string | null = null;

  if (checks.supabaseUrl && checks.supabaseServiceRole) {
    try {
      const supabase = getSupabaseAdmin();
      const { count, error } = await supabase.from("plans").select("id", { count: "exact", head: true });
      if (error) databaseError = error.message;
      else {
        database = "ok";
        planCount = count ?? 0;
      }

      const { data: bucket, error: bucketError } = await supabase.storage.getBucket("uploads");
      if (bucketError) {
        const { data: bucketRow, error: bucketRowError } = await supabase
          .schema("storage")
          .from("buckets")
          .select("id, public")
          .eq("id", "uploads")
          .maybeSingle();

        if (bucketRowError) storageError = `${bucketError.message}; ${bucketRowError.message}`;
        else if (bucketRow?.public === false) storage = "ok";
        else storageError = bucketError.message;
      } else storage = bucket?.public === false ? "ok" : "degraded";
    } catch (error) {
      databaseError = error instanceof Error ? error.message : "Erro desconhecido.";
    }
  }

  const stripePrices = Object.fromEntries(
    Object.entries(PLAN_PRICE_ENV).map(([planCode, envName]) => [planCode, hasEnv(envName)]),
  );

  const required = [
    checks.appUrl,
    checks.authSecret,
    checks.supabasePublicUrl,
    checks.supabasePublicAnon,
    checks.supabaseUrl,
    checks.supabaseServiceRole,
    checks.supabaseAnon,
    checks.stripeSecret,
    checks.stripeWebhook,
    checks.stripePublishable,
    checks.engineToken,
    ...Object.values(stripePrices),
  ];
  const status = required.every(Boolean) && database === "ok" && storage === "ok" && planCount >= 4 ? "ok" : "degraded";

  return Response.json(
    {
      service: "hubflow-web",
      status,
      timestamp: new Date().toISOString(),
      checks: {
        env: checks,
        stripePrices,
        database,
        databaseError,
        planCount,
        storage,
        storageError,
      },
    },
    { status: status === "ok" ? 200 : 503 },
  );
}
