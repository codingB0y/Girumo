import { Users, Mail, Building2, Shield } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminUsuariosPage() {
  const supabase = getSupabaseAdmin();

  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, created_at, tenant_id, auth_user_id")
    .order("created_at", { ascending: false })
    .limit(100);

  // Buscar roles das memberships
  const { data: memberships } = await supabase
    .from("memberships")
    .select("user_id, role, tenant_id")
    .not("accepted_at", "is", null);

  const roleMap = new Map<string, string>();
  for (const m of memberships ?? []) {
    roleMap.set(m.user_id, m.role);
  }

  // Buscar nomes dos tenants
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name");

  const orgMap = new Map<string, string>();
  for (const o of orgs ?? []) {
    orgMap.set(o.id, o.name);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Usuários</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          {(users ?? []).length} usuários na plataforma
        </p>
      </div>

      <div className="rounded-2xl border border-breu/[0.06] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-breu/[0.06]">
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Nome</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">E-mail</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Organização</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Role</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Criado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-breu/[0.04]">
              {(users ?? []).map((u) => {
                const role = roleMap.get(u.auth_user_id) ?? "—";
                const orgName = orgMap.get(u.tenant_id) ?? "—";
                return (
                  <tr key={u.id} className="transition hover:bg-bruma/30">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 font-data text-xs font-bold text-blue-600">
                          {(u.name ?? "U").slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium text-breu">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 font-data text-xs text-aco/60">
                        <Mail className="h-3 w-3" /> {u.email}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs text-aco/60">
                        <Building2 className="h-3 w-3" /> {orgName}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <RoleBadge role={role} />
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-aco/50">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(users ?? []).length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-aco/30" />
            <p className="text-sm text-aco/50">Nenhum usuário encontrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: "bg-amber-50 text-amber-700",
    admin: "bg-purple-50 text-purple-700",
    operator: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${styles[role] ?? "bg-slate-100 text-slate-500"}`}>
      <Shield className="h-3 w-3" />
      {role}
    </span>
  );
}
