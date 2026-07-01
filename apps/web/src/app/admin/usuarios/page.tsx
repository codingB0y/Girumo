import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminUsersClient } from "@/components/admin/users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsuariosPage() {
  const supabase = getSupabaseAdmin();

  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, created_at, tenant_id, auth_user_id")
    .order("created_at", { ascending: false })
    .limit(200);

  // Buscar roles das memberships
  const { data: memberships } = await supabase
    .from("memberships")
    .select("user_id, role, tenant_id")
    .not("accepted_at", "is", null);

  const roleMap: Record<string, string> = {};
  for (const m of memberships ?? []) {
    roleMap[m.user_id] = m.role;
  }

  // Buscar nomes dos tenants
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name");

  const orgMap: Record<string, string> = {};
  for (const o of orgs ?? []) {
    orgMap[o.id] = o.name;
  }

  const enrichedUsers = (users ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.created_at,
    tenantId: u.tenant_id,
    tenantName: orgMap[u.tenant_id] ?? "—",
    role: roleMap[u.auth_user_id] ?? "—",
  }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Usuários</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          {enrichedUsers.length} usuários na plataforma
        </p>
      </div>

      <AdminUsersClient users={enrichedUsers} />
    </div>
  );
}
