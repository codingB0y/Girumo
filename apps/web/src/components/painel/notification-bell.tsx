"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/components/painel/role-provider";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const TYPE_COLORS: Record<string, string> = {
  success: "bg-sucesso/10 text-sucesso",
  warning: "bg-atencao/10 text-atencao",
  error: "bg-alerta/10 text-alerta",
  info: "bg-cobalt-500/10 text-cobalt-500",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { tenantId } = useRole();

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + Supabase Realtime subscription
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime — só assina depois de saber o tenant, e filtra por ele no servidor.
  // A RLS de `notifications` já isola por tenant; o filtro é defesa em
  // profundidade e evita que o servidor avalie cada INSERT de cada tenant
  // contra esta assinatura.
  useEffect(() => {
    if (!tenantId) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`notifications-realtime-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev].slice(0, 30));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markAsRead(ids: string[]) {
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }

  async function markAllRead() {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
    );
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-volt-950/10 bg-white text-aco transition hover:border-cobalt-500/30"
        aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ""}`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-cobalt-500 text-[9px] font-bold text-white ring-2 ring-canvas-100">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-volt-950/10 bg-white shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-volt-950/[0.06] px-4 py-3">
            <h3 className="font-display text-sm font-bold text-volt-950">Notificações</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-cobalt-500 transition hover:text-cobalt-700"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-aco/50">Carregando...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-8 w-8 text-aco/20" />
                <p className="mt-2 text-sm text-aco/50">Nenhuma notificação ainda.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 border-b border-volt-950/[0.04] px-4 py-3 transition last:border-0",
                    !n.read_at && "bg-cobalt-500/[0.03]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      TYPE_COLORS[n.type] ?? TYPE_COLORS.info,
                    )}
                  >
                    <Bell className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.read_at ? "font-medium text-volt-950" : "text-aco/70")}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-aco/55 line-clamp-2">{n.body}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-data text-[10px] text-aco/40">{timeAgo(n.created_at)}</span>
                      {n.href && (
                        <a
                          href={n.href}
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-cobalt-500 hover:text-cobalt-700"
                        >
                          Ver <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                  {!n.read_at && (
                    <button
                      onClick={() => markAsRead([n.id])}
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-aco/40 transition hover:bg-canvas-100 hover:text-cobalt-500"
                      aria-label="Marcar como lida"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
