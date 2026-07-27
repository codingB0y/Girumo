"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, AlertTriangle, CreditCard, Smartphone, UserPlus, Info, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Alert = {
  id: string;
  type: string;
  severity: string;
  title: string;
  message?: string;
  tenant_id?: string;
  read_at?: string;
  created_at: string;
};

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string }> = {
  billing: { icon: CreditCard, color: "text-amber-500 bg-amber-50" },
  instance: { icon: Smartphone, color: "text-red-500 bg-red-50" },
  error: { icon: AlertTriangle, color: "text-red-600 bg-red-50" },
  signup: { icon: UserPlus, color: "text-blue-500 bg-blue-50" },
  info: { icon: Info, color: "text-slate-500 bg-slate-100" },
};

export function AdminAlertsDropdown() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAlerts();
    // Poll every 30s
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchAlerts() {
    try {
      const res = await fetch("/api/admin/alerts?unread=true");
      if (!res.ok) return;
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      setUnreadCount(data.count ?? 0);
    } catch {}
  }

  async function markAllRead() {
    if (alerts.length === 0) return;
    setLoading(true);
    const ids = alerts.filter((a) => !a.read_at).map((a) => a.id);
    if (ids.length === 0) { setLoading(false); return; }

    try {
      await fetch("/api/admin/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action: "read" }),
      });
      setAlerts((prev) => prev.map((a) => ({ ...a, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {}
    setLoading(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-volt-950/10 bg-white text-aco transition hover:border-cobalt-500/30"
        aria-label="Alertas"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-alerta font-data text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-volt-950/[0.08] bg-white shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-volt-950/[0.06] px-4 py-3">
            <h3 className="font-display text-sm font-bold">Alertas</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="inline-flex items-center gap-1 font-data text-[11px] text-cobalt-500 hover:underline disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                Marcar todos como lidos
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Bell className="h-6 w-6 text-aco/25" />
                <p className="text-xs text-aco/50">Nenhum alerta pendente</p>
              </div>
            ) : (
              <div className="divide-y divide-volt-950/[0.04]">
                {alerts.slice(0, 10).map((alert) => {
                  const config = TYPE_CONFIG[alert.type] ?? TYPE_CONFIG.info;
                  const Icon = config.icon;
                  const isUnread = !alert.read_at;

                  return (
                    <div
                      key={alert.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 transition",
                        isUnread ? "bg-cobalt-500/[0.02]" : "",
                      )}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.color}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={cn("text-sm text-volt-950", isUnread ? "font-medium" : "")}>
                            {alert.title}
                          </p>
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-cobalt-500" />
                          )}
                        </div>
                        {alert.message && (
                          <p className="mt-0.5 truncate font-data text-[11px] text-aco/50">
                            {alert.message}
                          </p>
                        )}
                        <p className="mt-0.5 font-data text-[10px] text-aco/40">
                          {new Date(alert.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {alerts.length > 0 && (
            <div className="border-t border-volt-950/[0.06] px-4 py-2.5 text-center">
              <a
                href="/admin/alertas"
                className="font-data text-[11px] uppercase tracking-wider text-cobalt-500 hover:underline"
              >
                Ver todos os alertas
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
