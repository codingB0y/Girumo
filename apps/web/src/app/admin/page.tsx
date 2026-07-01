import {
  Building2,
  Users,

  CreditCard,
  TrendingUp,
  Activity,
} from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminStatCard } from "@/components/admin/stat-card";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = getSupabaseAdmin();

  // Métricas globais da plataforma
  const [tenantsRes, usersRes, membershipsRes, subsRes] = await Promise.all([
    supabase.from("organizations").select("id", { count: "exact", head: true }),
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("memberships").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id, status", { count: "exact" }),
  ]);

  const totalTenants = tenantsRes.count ?? 0;
  const totalUsers = usersRes.count ?? 0;
  const totalMemberships = membershipsRes.count ?? 0;

  const subscriptions = subsRes.data ?? [];
  const activeSubs = subscriptions.filter(
    (s) => s.status === "active" || s.status === "trialing",
  ).length;
  const freeSubs = subscriptions.filter((s) => s.status === "free").length;

  // Tenants recentes (últimos 10)
  const { data: recentTenants } = await supabase
    .from("organizations")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  // Usuários recentes
  const { data: recentUsers } = await supabase
    .from("users")
    .select("id, name, email, created_at, tenant_id")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Dashboard da Plataforma</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          Visão geral de todos os tenants e métricas
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <AdminStatCard label="Tenants" value={totalTenants} icon={Building2} tone="purple" />
        <AdminStatCard label="Usuários" value={totalUsers} icon={Users} tone="blue" />
        <AdminStatCard label="Memberships" value={totalMemberships} icon={Users} tone="slate" />
        <AdminStatCard label="Assinaturas ativas" value={activeSubs} icon={CreditCard} tone="green" />
        <AdminStatCard label="Plano Free" value={freeSubs} icon={TrendingUp} tone="amber" />
        <AdminStatCard label="Total subs" value={subscriptions.length} icon={Activity} tone="slate" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tenants recentes */}
        <section className="rounded-2xl border border-breu/[0.06] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-breu/[0.06] pb-4">
            <h2 className="font-display text-base font-bold">Tenants recentes</h2>
            <Link href="/admin/tenants" className="font-data text-[11px] uppercase tracking-wider text-iris hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {(recentTenants ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-aco/50">Nenhum tenant cadastrado.</p>
            )}
            {(recentTenants ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border border-breu/[0.04] px-4 py-3 transition hover:bg-bruma/40">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-iris/10 font-data text-xs font-bold text-iris">
                    {(t.name ?? "T").slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-breu">{t.name}</p>
                    <p className="font-data text-[11px] text-aco/50">{t.slug}</p>
                  </div>
                </div>
                <span className="font-data text-[11px] text-aco/45">
                  {new Date(t.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Usuários recentes */}
        <section className="rounded-2xl border border-breu/[0.06] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-breu/[0.06] pb-4">
            <h2 className="font-display text-base font-bold">Usuários recentes</h2>
            <Link href="/admin/usuarios" className="font-data text-[11px] uppercase tracking-wider text-iris hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {(recentUsers ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-aco/50">Nenhum usuário cadastrado.</p>
            )}
            {(recentUsers ?? []).map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-xl border border-breu/[0.04] px-4 py-3 transition hover:bg-bruma/40">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 font-data text-xs font-bold text-blue-600">
                    {(u.name ?? "U").slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-breu">{u.name}</p>
                    <p className="font-data text-[11px] text-aco/50">{u.email}</p>
                  </div>
                </div>
                <span className="font-data text-[11px] text-aco/45">
                  {new Date(u.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
