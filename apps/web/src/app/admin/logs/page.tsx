import { Activity } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminLogsClient } from "@/components/admin/logs-client";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type Props = { searchParams: Promise<{ page?: string; level?: string; tenant?: string }> };

export default async function AdminLogsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const levelFilter = params.level ?? "all";
  const tenantFilter = params.tenant ?? "all";
  const offset = (page - 1) * PER_PAGE;

  const supabase = getSupabaseAdmin();

  // Query com filtros
  let query = supabase
    .from("logs")
    .select("id, actor_user_id, instance_id, level, event, message, metadata, tenant_id, created_at", { count: "exact" });

  if (levelFilter !== "all") {
    query = query.eq("level", levelFilter);
  }

  if (tenantFilter !== "all") {
    query = query.eq("tenant_id", tenantFilter);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + PER_PAGE - 1);

  const { data: logsData, count: totalCount, error: logsError } = await query;

  let logs: Array<{
    id: string;
    event: string;
    level: string;
    message?: string;
    tenantId?: string;
    tenantName?: string;
    createdAt: string;
  }> = [];

  let source: "logs" | "audit_logs" | "none" = "none";
  let fetchError: string | null = null;

  if (!logsError && (logsData ?? []).length > 0) {
    source = "logs";
  } else if (logsError) {
    // Fallback para audit_logs
    const { data: auditData, error: auditError } = await supabase
      .from("audit_logs")
      .select("id, action, actor_id, tenant_id, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + PER_PAGE - 1);

    if (!auditError && (auditData ?? []).length > 0) {
      logs = (auditData ?? []).map((l) => ({
        id: l.id,
        event: l.action ?? "—",
        level: "info",
        message: l.metadata ? JSON.stringify(l.metadata) : undefined,
        tenantId: l.tenant_id ?? undefined,
        createdAt: l.created_at,
      }));
      source = "audit_logs";
    } else {
      fetchError = logsError?.message ?? auditError?.message ?? null;
    }
  }

  // Se veio de "logs" table, mapear
  if (source === "logs") {
    logs = (logsData ?? []).map((l) => ({
      id: l.id,
      event: l.event ?? "—",
      level: l.level ?? "info",
      message: l.message ?? (l.metadata ? JSON.stringify(l.metadata) : undefined),
      tenantId: l.tenant_id ?? undefined,
      createdAt: l.created_at,
    }));
  }

  // Buscar nomes dos tenants para contexto
  const tenantIds = [...new Set(logs.map((l) => l.tenantId).filter(Boolean))] as string[];
  const { data: orgs } = tenantIds.length > 0
    ? await supabase.from("organizations").select("id, name").in("id", tenantIds)
    : { data: [] };

  const orgMap: Record<string, string> = {};
  for (const o of orgs ?? []) {
    orgMap[o.id] = o.name;
  }

  // Enriquecer logs com tenant name
  logs = logs.map((l) => ({
    ...l,
    tenantName: l.tenantId ? orgMap[l.tenantId] ?? undefined : undefined,
  }));

  // Buscar todos os tenants pra filtro
  const { data: allOrgs } = await supabase.from("organizations").select("id, name").order("name").limit(100);
  const tenantOptions = (allOrgs ?? []).map((o) => ({ id: o.id, name: o.name }));

  const hasLogs = logs.length > 0 || (totalCount ?? 0) > 0;
  const totalPages = Math.ceil((totalCount ?? 0) / PER_PAGE);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Logs & Eventos</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
            {hasLogs
              ? `${totalCount ?? 0} registros · Fonte: ${source} · Página ${page}`
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
          </div>
        </div>
      ) : (
        <AdminLogsClient
          logs={logs}
          tenants={tenantOptions}
          pagination={{ page, totalPages, totalCount: totalCount ?? 0, perPage: PER_PAGE }}
          filters={{ level: levelFilter, tenant: tenantFilter }}
        />
      )}
    </div>
  );
}
