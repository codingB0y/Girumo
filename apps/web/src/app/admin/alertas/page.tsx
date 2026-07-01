import { Bell, AlertTriangle, CreditCard, Smartphone, UserPlus, Info } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminAlertsClient } from "@/components/admin/alerts-client";

export const dynamic = "force-dynamic";

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bell }> = {
  billing: { label: "Financeiro", icon: CreditCard },
  instance: { label: "Instância", icon: Smartphone },
  error: { label: "Erro", icon: AlertTriangle },
  signup: { label: "Novo Signup", icon: UserPlus },
  info: { label: "Info", icon: Info },
};

export default async function AdminAlertasPage() {
  const supabase = getSupabaseAdmin();

  const { data: alerts, count } = await supabase
    .from("admin_alerts")
    .select("id, type, severity, title, message, metadata, tenant_id, read_at, resolved_at, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(100);

  const unreadCount = (alerts ?? []).filter((a) => !a.read_at).length;

  // Buscar nomes dos tenants mencionados
  const tenantIds = [...new Set((alerts ?? []).map((a) => a.tenant_id).filter(Boolean))] as string[];
  const { data: orgs } = tenantIds.length > 0
    ? await supabase.from("organizations").select("id, name").in("id", tenantIds)
    : { data: [] };

  const orgMap: Record<string, string> = {};
  for (const o of orgs ?? []) {
    orgMap[o.id] = o.name;
  }

  const enrichedAlerts = (alerts ?? []).map((a) => ({
    ...a,
    tenantName: a.tenant_id ? orgMap[a.tenant_id] ?? undefined : undefined,
  }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Alertas</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
            {count ?? 0} alertas · {unreadCount} não lidos
          </p>
        </div>
      </div>

      <AdminAlertsClient alerts={enrichedAlerts} />
    </div>
  );
}
