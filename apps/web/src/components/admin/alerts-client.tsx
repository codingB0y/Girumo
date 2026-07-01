"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  AlertTriangle,
  CreditCard,
  Smartphone,
  UserPlus,
  Info,
  Check,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Alert = {
  id: string;
  type: string;
  severity: string;
  title: string;
  message?: string;
  tenant_id?: string;
  tenantName?: string;
  read_at?: string;
  resolved_at?: string;
  created_at: string;
};

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  billing: { icon: CreditCard, color: "text-amber-500 bg-amber-50", label: "Financeiro" },
  instance: { icon: Smartphone, color: "text-red-500 bg-red-50", label: "Instância" },
  error: { icon: AlertTriangle, color: "text-red-600 bg-red-50", label: "Erro" },
  signup: { icon: UserPlus, color: "text-blue-500 bg-blue-50", label: "Signup" },
  info: { icon: Info, color: "text-slate-500 bg-slate-100", label: "Info" },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-l-red-500",
  warning: "border-l-amber-400",
  info: "border-l-blue-300",
};

export function AdminAlertsClient({ alerts }: { alerts: Alert[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread" | "resolved">("all");
  const [actionLoading, setActionLoading] = useState(false);

  const filtered = alerts.filter((a) => {
    if (filter === "unread") return !a.read_at;
    if (filter === "resolved") return !!a.resolved_at;
    return true;
  });

  async function markAllRead() {
    const ids = alerts.filter((a) => !a.read_at).map((a) => a.id);
    if (!ids.length) return;
    setActionLoading(true);
    await fetch("/api/admin/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "read" }),
    });
    setActionLoading(false);
    router.refresh();
  }

  async function resolveAlert(id: string) {
    await fetch("/api/admin/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], action: "resolve" }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Filters + Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {(["all", "unread", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1.5 font-data text-[11px] uppercase tracking-wider transition",
              filter === f
                ? "bg-iris/10 text-iris ring-1 ring-iris/20"
                : "bg-white border border-breu/[0.06] text-aco/60 hover:bg-bruma/40",
            )}
          >
            {f === "all" ? "Todos" : f === "unread" ? "Não lidos" : "Resolvidos"}
          </button>
        ))}

        <div className="ml-auto">
          <button
            onClick={markAllRead}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-breu/[0.06] bg-white px-4 py-2.5 font-data text-xs text-aco/60 shadow-sm transition hover:border-iris/20 hover:text-iris disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todos como lidos
          </button>
        </div>
      </div>

      {/* Alerts list */}
      <div className="rounded-2xl border border-breu/[0.06] bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Bell className="h-8 w-8 text-aco/25" />
            <p className="text-sm text-aco/50">
              {filter === "unread" ? "Nenhum alerta não lido" : "Nenhum alerta encontrado"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-breu/[0.04]">
            {filtered.map((alert) => {
              const config = TYPE_CONFIG[alert.type] ?? TYPE_CONFIG.info;
              const Icon = config.icon;
              const isUnread = !alert.read_at;
              const isResolved = !!alert.resolved_at;

              return (
                <div
                  key={alert.id}
                  className={cn(
                    "flex items-start gap-4 border-l-4 px-5 py-4 transition",
                    SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info,
                    isUnread ? "bg-iris/[0.02]" : "",
                  )}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.color}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm text-breu", isUnread ? "font-semibold" : "font-medium")}>
                        {alert.title}
                      </p>
                      <span className={`rounded-full px-2 py-0.5 font-data text-[9px] uppercase tracking-wider ${config.color}`}>
                        {config.label}
                      </span>
                      {isUnread && <span className="h-2 w-2 rounded-full bg-iris" />}
                      {isResolved && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-data text-[9px] uppercase tracking-wider text-emerald-600">
                          Resolvido
                        </span>
                      )}
                    </div>
                    {alert.message && (
                      <p className="mt-1 text-xs text-aco/60">{alert.message}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="font-data text-[10px] text-aco/40">
                        {new Date(alert.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {alert.tenantName && (
                        <span className="font-data text-[10px] text-aco/40">
                          Tenant: {alert.tenantName}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isResolved && (
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="shrink-0 rounded-lg border border-breu/10 bg-white px-3 py-1.5 font-data text-[11px] text-aco/60 transition hover:border-emerald-200 hover:text-emerald-600"
                    >
                      <Check className="inline h-3 w-3" /> Resolver
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
