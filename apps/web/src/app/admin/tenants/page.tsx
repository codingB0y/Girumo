import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminTenantsClient } from "@/components/admin/tenants-client";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  const supabase = getSupabaseAdmin();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(200);

  // Buscar contagem de membros por tenant
  const { data: memberCounts } = await supabase
    .from("memberships")
    .select("tenant_id")
    .not("accepted_at", "is", null);

  const countMap: Record<string, number> = {};
  for (const m of memberCounts ?? []) {
    countMap[m.tenant_id] = (countMap[m.tenant_id] ?? 0) + 1;
  }

  // Buscar status de subscription por tenant
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("tenant_id, status, plan_id")
    .order("created_at", { ascending: false });

  const subMap: Record<string, { status: string; plan_id: string }> = {};
  for (const s of subs ?? []) {
    if (!subMap[s.tenant_id]) {
      subMap[s.tenant_id] = { status: s.status, plan_id: s.plan_id };
    }
  }

  // Buscar nomes dos planos
  const { data: plans } = await supabase.from("plans").select("id, name, code");
  const planMap: Record<string, string> = {};
  for (const p of plans ?? []) {
    planMap[p.id] = p.name ?? p.code;
  }

  const tenants = (orgs ?? []).map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.created_at,
    members: countMap[org.id] ?? 0,
    subscriptionStatus: subMap[org.id]?.status ?? "free",
    planName: subMap[org.id]?.plan_id ? planMap[subMap[org.id].plan_id] ?? "—" : "Free",
  }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Tenants</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
            {tenants.length} organizações cadastradas
          </p>
        </div>
      </div>

      <AdminTenantsClient tenants={tenants} />
    </div>
  );
}
