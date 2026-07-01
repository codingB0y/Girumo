import { Activity } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminLogsClient } from "@/components/admin/logs-client";

export const dynamic = "force-dynamic";

export default async function AdminLogsPage() {
  const supabase = getSupabaseAdmin();

  // Tentar buscar de audit_logs primeiro, fallback para logs
  let logs: Array<{
    id: string;
    action?: string;
    event?: string;
    level?: string;
    actor_id?: string;
    actor_user_id?: string;
    tenant_id?: string;
    message?: string;
    metadata?: unknown;
    created_at: string;
  }> = [];
  let source: "audit_logs" | "logs" | "none" = "none";
  let fetchError: string | null = null;

  // Tentar tabela "logs" (que a API usa)
  const { data: logsData, error: logsError } = await supabase
    .from("logs")
    .select("id, actor_user_id, instance_id, level, event, message, metadata, tenant_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!logsError && (logsData ?? []).length > 0) {
    logs = (logsData ?? []).map((l) => ({
      id: l.id,
      event: l.event,
      level: l.level,
      actor_user_id: l.actor_user_id,
      tenant_id: l.tenant_id,
      message: l.message,
      metadata: l.metadata,
      created_at: l.created_at,
    }));
    source = "logs";
  } else {
    // Fallback para audit_logs
    const { data: auditData, error: auditError } = await supabase
      .from("audit_logs")
      .select("id, action, actor_id, tenant_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!auditError && (auditData ?? []).length > 0) {
      logs = (auditData ?? []).map((l) => ({
        id: l.id,
        action: l.action,
        actor_id: l.actor_id,
        tenant_id: l.tenant_id,
        metadata: l.metadata,
        created_at: l.created_at,
      }));
      source = "audit_logs";
    } else {
      fetchError = logsError?.message ?? auditError?.message ?? null;
    }
  }

  // Buscar nomes dos tenants para contexto
  const tenantIds = [...new Set(logs.map((l) => l.tenant_id).filter(Boolean))];
  const { data: orgs } = tenantIds.length > 0
    ? await supabase.from("organizations").select("id, name").in("id", tenantIds)
    : { data: [] };

  const orgMap: Record<string, string> = {};
  for (const o of orgs ?? []) {
    orgMap[o.id] = o.name;
  }

  const hasLogs = logs.length > 0;

  const tenants = [...new Set(logs.map((l) => l.tenant_id).filter(Boolean))] as string[];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Logs & Eventos</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
            {hasLogs
              ? `${logs.length} registros · Fonte: ${source}`
              : "Auditoria de ações na plataforma"}
          </p>
        </div>
      </div>

      {!hasLogs ? (
        <div className="rounded-2xl border border-breu/[0.06] bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Activity className="h-10 w-10 text-aco/25" />
            <div>
              <p className="text-sm font-medium text-breu">Nenhum log disponível</p>
              <p className="mt-1 max-w-sm text-xs text-aco/50">
                {fetchError
                  ? "As tabelas 'logs' e 'audit_logs' não existem ou estão vazias."
                  : "Nenhuma ação registrada ainda."}
              </p>
            </div>
            {fetchError && (
              <div className="mt-4 w-full max-w-lg rounded-xl bg-amber-50 px-4 py-3 text-left">
                <p className="font-data text-[11px] uppercase tracking-wider text-amber-700">Sugestão de schema</p>
                <pre className="mt-2 overflow-x-auto font-data text-xs text-amber-900">
{`create table logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references organizations(id),
  actor_user_id uuid,
  instance_id uuid,
  level text default 'info' check (level in ('debug','info','warn','error')),
  event text not null,
  message text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_logs_tenant_created on logs(tenant_id, created_at desc);
create index idx_logs_level on logs(level);`}
                </pre>
              </div>
            )}
          </div>
        </div>
      ) : (
        <AdminLogsClient
          logs={logs.map((l) => ({
            id: l.id,
            event: l.event ?? l.action ?? "—",
            level: l.level ?? "info",
            message: l.message ?? (l.metadata ? JSON.stringify(l.metadata) : undefined),
            tenantId: l.tenant_id ?? undefined,
            tenantName: l.tenant_id ? orgMap[l.tenant_id] ?? undefined : undefined,
            createdAt: l.created_at,
          }))}
          tenants={tenants.map((tid) => ({ id: tid, name: orgMap[tid] ?? tid }))}
        />
      )}
    </div>
  );
}
