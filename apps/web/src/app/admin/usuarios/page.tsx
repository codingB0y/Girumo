import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminUsersClient } from "@/components/admin/users-client";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

type Props = { searchParams: Promise<{ page?: string; search?: string; role?: string }> };

export default async function AdminUsuariosPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const search = params.search ?? "";
  const roleFilter = params.role ?? "all";
  const offset = (page - 1) * PER_PAGE;

  const supabase = getSupabaseAdmin();

  // Query com filtros server-side
  let query = supabase
    .from("users")
    .select("id, name, email, created_at, tenant_id, auth_user_id", { count: "exact" });

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + PER_PAGE - 1);

  const { data: users, count: totalCount } = await query;

  // Buscar roles das memberships
  const userAuthIds = (users ?? []).map((u) => u.auth_user_id).filter(Boolean);
  const { data: memberships } = userAuthIds.length > 0
    ? await supabase
        .from("memberships")
        .select("user_id, role, tenant_id")
        .in("user_id", userAuthIds)
        .not("accepted_at", "is", null)
    : { data: [] };

  const roleMap: Record<string, string> = {};
  for (const m of memberships ?? []) {
    roleMap[m.user_id] = m.role;
  }

  // Buscar nomes dos tenants
  const tenantIds = [...new Set((users ?? []).map((u) => u.tenant_id).filter(Boolean))];
  const { data: orgs } = tenantIds.length > 0
    ? await supabase.from("organizations").select("id, name").in("id", tenantIds)
    : { data: [] };

  const orgMap: Record<string, string> = {};
  for (const o of orgs ?? []) {
    orgMap[o.id] = o.name;
  }

  let enrichedUsers = (users ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.created_at,
    tenantId: u.tenant_id,
    tenantName: orgMap[u.tenant_id] ?? "—",
    role: roleMap[u.auth_user_id] ?? "—",
  }));

  if (roleFilter !== "all") {
    enrichedUsers = enrichedUsers.filter((u) => u.role === roleFilter);
  }

  const totalPages = Math.ceil((totalCount ?? 0) / PER_PAGE);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Usuários</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          {totalCount ?? 0} usuários na plataforma
        </p>
      </div>

      <AdminUsersClient
        users={enrichedUsers}
        pagination={{ page, totalPages, totalCount: totalCount ?? 0, perPage: PER_PAGE }}
        filters={{ search, role: roleFilter }}
      />
    </div>
  );
}
