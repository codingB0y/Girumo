import { CreditCard, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminStatCard } from "@/components/admin/stat-card";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  const supabase = getSupabaseAdmin();

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, tenant_id, status, plan_id, created_at, metadata")
    .order("created_at", { ascending: false });

  const { data: plans } = await supabase.from("plans").select("id, code, name, price_cents");

  const planMap = new Map<string, { code: string; name: string; price_cents: number }>();
  for (const p of plans ?? []) {
    planMap.set(p.id, { code: p.code, name: p.name, price_cents: p.price_cents });
  }

  // Buscar nomes dos tenants
  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const orgMap = new Map<string, string>();
  for (const o of orgs ?? []) {
    orgMap.set(o.id, o.name);
  }

  const allSubs = subs ?? [];
  const active = allSubs.filter((s) => s.status === "active" || s.status === "trialing");
  const free = allSubs.filter((s) => s.status === "free");
  const pastDue = allSubs.filter((s) => s.status === "past_due");
  const canceled = allSubs.filter((s) => s.status === "canceled");

  // MRR estimado (soma dos planos ativos)
  const mrr = active.reduce((acc, s) => {
    const plan = planMap.get(s.plan_id);
    return acc + (plan?.price_cents ?? 0);
  }, 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Billing</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          Visão financeira da plataforma
        </p>
      </div>

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <AdminStatCard
          label="MRR estimado"
          value={`R$ ${(mrr / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          tone="green"
        />
        <AdminStatCard label="Ativas" value={active.length} icon={CheckCircle2} tone="green" />
        <AdminStatCard label="Free" value={free.length} icon={CreditCard} tone="slate" />
        <AdminStatCard label="Inadimplentes" value={pastDue.length} icon={AlertTriangle} tone="amber" />
        <AdminStatCard label="Canceladas" value={canceled.length} icon={CreditCard} tone="red" />
      </div>

      {/* Tabela de assinaturas */}
      <div className="rounded-2xl border border-breu/[0.06] bg-white shadow-sm">
        <div className="border-b border-breu/[0.06] px-5 py-4">
          <h2 className="font-display text-base font-bold">Todas as assinaturas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-breu/[0.06]">
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Tenant</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Plano</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Preço</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Status</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Criado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-breu/[0.04]">
              {allSubs.map((s) => {
                const plan = planMap.get(s.plan_id);
                return (
                  <tr key={s.id} className="transition hover:bg-bruma/30">
                    <td className="px-5 py-3.5 font-medium text-breu">
                      {orgMap.get(s.tenant_id) ?? s.tenant_id}
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-aco/60">
                      {plan?.name ?? plan?.code ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-breu">
                      {plan?.price_cents
                        ? `R$ ${(plan.price_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-aco/50">
                      {new Date(s.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {allSubs.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <CreditCard className="h-8 w-8 text-aco/30" />
            <p className="text-sm text-aco/50">Nenhuma assinatura encontrada.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    trialing: "bg-blue-50 text-blue-700",
    free: "bg-slate-100 text-slate-600",
    canceled: "bg-red-50 text-red-600",
    past_due: "bg-amber-50 text-amber-700",
  };
  const labels: Record<string, string> = {
    active: "Ativo",
    trialing: "Trial",
    free: "Free",
    canceled: "Cancelado",
    past_due: "Inadimplente",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${styles[status] ?? "bg-slate-100 text-slate-500"}`}>
      {labels[status] ?? status}
    </span>
  );
}
