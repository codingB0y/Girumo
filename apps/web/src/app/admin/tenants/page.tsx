import { Building2, ExternalLink, Users, CreditCard } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  const supabase = getSupabaseAdmin();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(100);

  // Buscar contagem de membros por tenant
  const { data: memberCounts } = await supabase
    .from("memberships")
    .select("tenant_id")
    .not("accepted_at", "is", null);

  const countMap = new Map<string, number>();
  for (const m of memberCounts ?? []) {
    countMap.set(m.tenant_id, (countMap.get(m.tenant_id) ?? 0) + 1);
  }

  // Buscar status de subscription por tenant
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("tenant_id, status, plan_id")
    .order("created_at", { ascending: false });

  const subMap = new Map<string, { status: string; plan_id: string }>();
  for (const s of subs ?? []) {
    if (!subMap.has(s.tenant_id)) {
      subMap.set(s.tenant_id, { status: s.status, plan_id: s.plan_id });
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Tenants</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
            {(orgs ?? []).length} organizações cadastradas
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-breu/[0.06] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-breu/[0.06]">
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Organização</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Slug</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Membros</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Plano</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Criado em</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-breu/[0.04]">
              {(orgs ?? []).map((org) => {
                const members = countMap.get(org.id) ?? 0;
                const sub = subMap.get(org.id);
                return (
                  <tr key={org.id} className="transition hover:bg-bruma/30">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-iris/10 font-data text-xs font-bold text-iris">
                          {(org.name ?? "T").slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium text-breu">{org.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-aco/60">{org.slug}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <Users className="h-3.5 w-3.5 text-aco/40" />
                        {members}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <SubscriptionBadge status={sub?.status} />
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-aco/50">
                      {new Date(org.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-5 py-3.5">
                      <a
                        href={`/admin/tenants/${org.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-iris hover:underline"
                      >
                        Detalhes <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(orgs ?? []).length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Building2 className="h-8 w-8 text-aco/30" />
            <p className="text-sm text-aco/50">Nenhum tenant cadastrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SubscriptionBadge({ status }: { status?: string }) {
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
  const s = status ?? "free";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${styles[s] ?? styles.free}`}>
      <CreditCard className="h-3 w-3" />
      {labels[s] ?? s}
    </span>
  );
}
