"use client";

import { useState, useMemo } from "react";
import {
  Activity,
  Clock,
  Info,
  Bug,
  Filter,
  Search,
  Download,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LogEntry = {
  id: string;
  event: string;
  level: string;
  message?: string;
  tenantId?: string;
  tenantName?: string;
  createdAt: string;
};

type Props = {
  logs: LogEntry[];
  tenants: Array<{ id: string; name: string }>;
};

const LEVEL_CONFIG: Record<string, { icon: typeof Info; bg: string; text: string; label: string }> = {
  debug: { icon: Bug, bg: "bg-slate-100", text: "text-slate-500", label: "Debug" },
  info: { icon: Info, bg: "bg-blue-50", text: "text-blue-500", label: "Info" },
  warn: { icon: TriangleAlert, bg: "bg-amber-50", text: "text-amber-500", label: "Warning" },
  error: { icon: TriangleAlert, bg: "bg-red-50", text: "text-red-500", label: "Error" },
};

export function AdminLogsClient({ logs, tenants }: Props) {
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (levelFilter !== "all" && log.level !== levelFilter) return false;
      if (tenantFilter !== "all" && log.tenantId !== tenantFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchEvent = log.event.toLowerCase().includes(q);
        const matchMessage = log.message?.toLowerCase().includes(q);
        const matchTenant = log.tenantName?.toLowerCase().includes(q);
        if (!matchEvent && !matchMessage && !matchTenant) return false;
      }
      return true;
    });
  }, [logs, levelFilter, tenantFilter, search]);

  // Level counts
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of logs) {
      counts[log.level] = (counts[log.level] ?? 0) + 1;
    }
    return counts;
  }, [logs]);

  function handleExport() {
    const csv = [
      "timestamp,level,event,message,tenant",
      ...filtered.map((l) =>
        `"${l.createdAt}","${l.level}","${l.event}","${l.message ?? ""}","${l.tenantName ?? ""}"`,
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hubflow-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Level summary pills */}
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(LEVEL_CONFIG).map(([level, config]) => {
          const count = levelCounts[level] ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={level}
              onClick={() => setLevelFilter(levelFilter === level ? "all" : level)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-data text-[11px] uppercase tracking-wider transition",
                levelFilter === level
                  ? `${config.bg} ${config.text} ring-2 ring-offset-1 ring-current/20`
                  : "bg-white border border-breu/[0.06] text-aco/60 hover:bg-bruma/40",
              )}
            >
              <config.icon className="h-3 w-3" />
              {config.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-breu/[0.06] bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-aco/50">
          <Filter className="h-4 w-4" />
        </div>

        {/* Busca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-aco/40" />
          <input
            type="text"
            placeholder="Buscar eventos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-breu/10 bg-bruma/30 py-2 pl-9 pr-3 font-data text-xs text-breu placeholder:text-aco/40 focus:border-iris/30 focus:outline-none focus:ring-1 focus:ring-iris/20"
          />
        </div>

        {/* Tenant filter */}
        {tenants.length > 1 && (
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="rounded-lg border border-breu/10 bg-bruma/30 px-3 py-2 font-data text-xs text-breu focus:border-iris/30 focus:outline-none"
          >
            <option value="all">Todos os tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        {/* Export */}
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-breu/10 bg-white px-3 py-2 font-data text-xs text-aco/60 transition hover:border-iris/20 hover:text-iris"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar
        </button>

        <span className="ml-auto font-data text-[11px] text-aco/45">
          {filtered.length} de {logs.length}
        </span>
      </div>

      {/* Log list */}
      <div className="rounded-2xl border border-breu/[0.06] bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Activity className="h-8 w-8 text-aco/25" />
            <p className="text-sm text-aco/50">Nenhum log corresponde aos filtros.</p>
          </div>
        ) : (
          <div className="divide-y divide-breu/[0.04] max-h-[600px] overflow-y-auto">
            {filtered.map((log) => {
              const config = LEVEL_CONFIG[log.level] ?? LEVEL_CONFIG.info;
              const Icon = config.icon;
              return (
                <div key={log.id} className="flex items-start gap-4 px-5 py-4 transition hover:bg-bruma/30">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${config.bg} ${config.text}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-breu">{log.event}</p>
                      <span className={`rounded-full px-1.5 py-0.5 font-data text-[9px] uppercase tracking-wider ${config.bg} ${config.text}`}>
                        {log.level}
                      </span>
                    </div>
                    {log.message && (
                      <p className="mt-0.5 truncate font-data text-[11px] text-aco/50">
                        {log.message}
                      </p>
                    )}
                    {log.tenantName && (
                      <p className="mt-0.5 font-data text-[10px] text-aco/40">
                        Tenant: {log.tenantName}
                      </p>
                    )}
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 font-data text-[11px] text-aco/45">
                    <Clock className="h-3 w-3" />
                    {new Date(log.createdAt).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
