import { Smartphone, Wifi, WifiOff } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminInstanciasPage() {
  const supabase = getSupabaseAdmin();

  // Buscar instâncias/sessões WhatsApp
  // Assumindo tabela "instances" ou similar — adaptar ao schema real
  const { data: instances } = await supabase
    .from("instances")
    .select("id, tenant_id, phone, status, profile_name, created_at, last_seen_at")
    .order("created_at", { ascending: false })
    .limit(100);

  // Buscar nomes dos tenants
  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const orgMap = new Map<string, string>();
  for (const o of orgs ?? []) {
    orgMap.set(o.id, o.name);
  }

  const hasInstances = (instances ?? []).length > 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Instâncias WhatsApp</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          Sessões conectadas de todos os tenants
        </p>
      </div>

      <div className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
        {!hasInstances ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Smartphone className="h-8 w-8 text-aco/30" />
            <p className="text-sm text-aco/50">
              Nenhuma instância encontrada.
            </p>
            <p className="text-xs text-aco/40">
              Verifique se a tabela &ldquo;instances&rdquo; existe no schema ou se as sessões estão sendo registradas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-volt-950/[0.06]">
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Telefone</th>
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Perfil</th>
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Tenant</th>
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Status</th>
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Última atividade</th>
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-volt-950/[0.04]">
                {(instances ?? []).map((inst) => (
                  <tr key={inst.id} className="transition hover:bg-canvas-100/30">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                          <Smartphone className="h-4 w-4" />
                        </span>
                        <span className="font-medium text-volt-950">{inst.phone ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-aco/60">{inst.profile_name ?? "—"}</td>
                    <td className="px-5 py-3.5 text-xs text-aco/60">
                      {orgMap.get(inst.tenant_id) ?? inst.tenant_id}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={inst.status} />
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-aco/50">
                      {inst.last_seen_at
                        ? new Date(inst.last_seen_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-aco/50">
                      {new Date(inst.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isOnline = status === "connected" || status === "online";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${
        isOnline ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
      }`}
    >
      {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {status ?? "desconhecido"}
    </span>
  );
}
