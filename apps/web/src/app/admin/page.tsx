import {
  Building2,
  Users,
  CreditCard,
  TrendingUp,
  Activity,
  AlertTriangle,
  Smartphone,
  Bot,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminStatCard } from "@/components/admin/stat-card";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = getSupabaseAdmin();

  // Métricas globais da plataforma
  const [tenantsRes, usersRes, membershipsRes, subsRes, instancesRes] = await Promise.all([
    supabase.from("organizations").select("id, created_at"),
    supabase.from("users").select("id, created_at"),
    supabase.from("memberships").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id, status, plan_id, tenant_id"),
    supabase.from("instances").select("id, status, tenant_id, last_seen_at").limit(500),
  ]);

  const orgs = tenantsRes.data ?? [];
  const users = usersRes.data ?? [];
  const totalMemberships = membershipsRes.count ?? 0;

  const subscriptions = subsRes.data ?? [];
  const activeSubs = subscriptions.filter(
    (s) => s.status === "active" || s.status === "trialing",
  ).length;
  const pastDueSubs = subscriptions.filter((s) => s.status === "past_due");
  const freeSubs = subscriptions.filter((s) => s.status === "free").length;

  const instances = instancesRes.data ?? [];
  const onlineInstances = instances.filter(
    (i) => i.status === "connected" || i.status === "online",
  ).length;
  const offlineInstances = instances.filter(
    (i) => i.status !== "connected" && i.status !== "online",
  );

  // Crescimento últimos 7 dias
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const newTenantsWeek = orgs.filter((o) => o.created_at >= sevenDaysAgo).length;
  const newUsersWeek = users.filter((u) => u.created_at >= sevenDaysAgo).length;

  // Tenants recentes (últimos 10)

  // Buscar nomes
  const { data: orgDetails } = await supabase
    .from("organizations")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  // Usuários recentes
  const { data: recentUsers } = await supabase
    .from("users")
    .select("id, name, email, created_at, tenant_id")
    .order("created_at", { ascending: false })
    .limit(8);

  // Alertas: tenants com problemas
  const alerts: { type: "warning" | "danger"; message: string; link: string }[] = [];

  if (pastDueSubs.length > 0) {
    alerts.push({
      type: "danger",
      message: `${pastDueSubs.length} tenant(s) inadimplente(s)`,
      link: "/admin/billing",
    });
  }

  if (offlineInstances.length > 0) {
    alerts.push({
      type: "warning",
      message: `${offlineInstances.length} instância(s) WhatsApp offline`,
      link: "/admin/instancias",
    });
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Dashboard da Plataforma</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
            Visão geral de todos os tenants e métricas
          </p>
        </div>
        <div className="flex items-center gap-2 font-data text-[11px] text-aco/45">
          <Clock className="h-3.5 w-3.5" />
          {new Date().toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <Link
              key={i}
              href={alert.link}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition hover:shadow-sm ${
                alert.type === "danger"
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100/60"
                  : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100/60"
              }`}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">{alert.message}</span>
              <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 opacity-50" />
            </Link>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <AdminStatCard
          label="Tenants"
          value={orgs.length}
          icon={Building2}
          tone="purple"
          delta={newTenantsWeek > 0 ? `+${newTenantsWeek} esta semana` : undefined}
        />
        <AdminStatCard
          label="Usuários"
          value={users.length}
          icon={Users}
          tone="blue"
          delta={newUsersWeek > 0 ? `+${newUsersWeek} esta semana` : undefined}
        />
        <AdminStatCard label="Memberships" value={totalMemberships} icon={Users} tone="slate" />
        <AdminStatCard label="Assinaturas ativas" value={activeSubs} icon={CreditCard} tone="green" />
        <AdminStatCard label="Plano Free" value={freeSubs} icon={TrendingUp} tone="amber" />
        <AdminStatCard
          label="Instâncias online"
          value={`${onlineInstances}/${instances.length}`}
          icon={Smartphone}
          tone={onlineInstances === instances.length ? "green" : "amber"}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href="/admin/tenants" label="Ver Tenants" icon={Building2} />
        <QuickAction href="/admin/agentes" label="Agentes IA" icon={Bot} />
        <QuickAction href="/admin/billing" label="Financeiro" icon={CreditCard} />
        <QuickAction href="/admin/saude" label="Saúde" icon={Activity} />
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
            {(orgDetails ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-aco/50">Nenhum tenant cadastrado.</p>
            )}
            {(orgDetails ?? []).map((t) => (
              <Link
                key={t.id}
                href={`/admin/tenants/${t.id}`}
                className="flex items-center justify-between rounded-xl border border-breu/[0.04] px-4 py-3 transition hover:bg-bruma/40 hover:border-iris/10"
              >
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
              </Link>
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

function QuickAction({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Building2 }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-breu/[0.06] bg-white px-4 py-3.5 shadow-sm transition hover:border-iris/20 hover:shadow-md"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-iris/10 text-iris">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium text-breu">{label}</span>
      <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-aco/30" />
    </Link>
  );
}
