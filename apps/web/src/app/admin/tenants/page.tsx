import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminTenantsClient } from "@/components/admin/tenants-client";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

type Props = { searchParams: Promise<{ page?: string; search?: string; status?: string }> };

export default async function AdminTenantsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const search = params.search ?? "";
  const statusFilter = params.status ?? "all";
  const offset = (page - 1) * PER_PAGE;

  const supabase = getSupabaseAdmin();

  // Query com filtros server-side
  let query = supabase
    .from("organizations")
    .select("id, name, slug, created_at, created_by", { count: "exact" });

  if (search) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + PER_PAGE - 1);

  const { data: orgs, count: totalCount } = await query;

  const tenantIds = (orgs ?? []).map((o) => o.id);

  // Buscar contagem de membros por tenant (apenas dos resultados)
  const { data: memberCounts } = tenantIds.length > 0
    ? await supabase
        .from("memberships")
        .select("tenant_id")
        .in("tenant_id", tenantIds)
        .not("accepted_at", "is", null)
    : { data: [] };

  const countMap: Record<string, number> = {};
  for (const m of memberCounts ?? []) {
    countMap[m.tenant_id] = (countMap[m.tenant_id] ?? 0) + 1;
  }

  // Buscar status de subscription por tenant
  const { data: subs } = tenantIds.length > 0
    ? await supabase
        .from("subscriptions")
        .select("tenant_id, status, plan_id")
        .in("tenant_id", tenantIds)
        .order("created_at", { ascending: false })
    : { data: [] };

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

  // Filtro de status (client-side pra não complicar a query join)
  let tenants = (orgs ?? []).map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.created_at,
    members: countMap[org.id] ?? 0,
    subscriptionStatus: subMap[org.id]?.status ?? "free",
    planName: subMap[org.id]?.plan_id ? planMap[subMap[org.id].plan_id] ?? "—" : "Free",
  }));

  if (statusFilter !== "all") {
    tenants = tenants.filter((t) => t.subscriptionStatus === statusFilter);
  }

  const totalPages = Math.ceil((totalCount ?? 0) / PER_PAGE);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Tenants</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
            {totalCount ?? 0} organizações cadastradas
          </p>
        </div>
      </div>

      <AdminTenantsClient
        tenants={tenants}
        pagination={{ page, totalPages, totalCount: totalCount ?? 0, perPage: PER_PAGE }}
        filters={{ search, status: statusFilter }}
      />
    </div>
  );
}
