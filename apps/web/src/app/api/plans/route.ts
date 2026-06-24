import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getStripePriceId } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("plans")
    .select("id, code, name, limits, stripe_price_id, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(
    (data ?? []).map((plan) => ({
      ...plan,
      stripe_price_id: plan.stripe_price_id ?? getStripePriceId(String(plan.code)),
    })),
  );
}
