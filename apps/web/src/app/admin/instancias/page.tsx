import { AlertTriangle, Smartphone, Wifi, WifiOff } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminInstanciasPage() {
  const supabase = getSupabaseAdmin();

  // Buscar instâncias/sessões WhatsApp
  const { data: instances, error: instancesError } = await supabase
    .from("instances")
    .select("id, tenant_id, phone, status, profile_name, created_at, last_seen_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (instancesError) {
    console.error("[admin/instancias] falha ao carregar instances:", instancesError.message);
  }

  // Buscar nomes dos tenants
  const { data: orgs, error: orgsError } = await supabase.from("organizations").select("id, name");

  if (orgsError) {
    console.error("[admin/instancias] falha ao carregar organizations:", orgsError.message);
  }

  const orgMap = new Map<string, string>();
  for (const o of orgs ?? []) {
    orgMap.set(o.id, o.name);
  }

  // Sem esta distinção a tela mente: uma query que falha devolve `data: null`,
  // que renderiza igualzinho a "não há instâncias". Foi assim que a ausência de
  // `instances.profile_name` em prod passou despercebida (auditoria 22/08, B.1).
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
        {instancesError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-2 py-12 text-center"
            data-estado="erro"
          >
            <AlertTriangle className="h-8 w-8 text-red-500/60" />
            <p className="text-sm font-semibold text-red-600">
              Falha ao carregar as instâncias.
            </p>
            <p className="max-w-lg text-xs text-aco/50">
              A consulta ao banco não respondeu. Isto <strong>não</strong> significa que não há
              instâncias — o número real é desconhecido enquanto o erro persistir.
            </p>
            <code className="font-data mt-1 max-w-lg break-all rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
              {instancesError.message}
            </code>
          </div>
        ) : !hasInstances ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center" data-estado="vazio">
            <Smartphone className="h-8 w-8 text-aco/30" />
            <p className="text-sm text-aco/50">
              Nenhuma instância encontrada.
            </p>
            <p className="text-xs text-aco/40">
              Nenhuma sessão de WhatsApp foi registrada ainda.
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
