"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
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

// Regra 4: nunca opacidade em cor. Fundo sólido neutro, ícone sólido na cor do tipo.
const TYPE_COLORS: Record<string, string> = {
  success: "bg-canvas-100 text-sucesso",
  warning: "bg-canvas-100 text-atencao",
  error: "bg-canvas-100 text-alerta",
  info: "bg-canvas-100 text-cobalt-500",
};

/** `tom="escuro"` é pro letreiro Volt da casca mobile. */
export function NotificationBell({ tom = "claro" }: { tom?: "claro" | "escuro" } = {}) {
  const instancia = useId().replace(/[^a-zA-Z0-9]/g, "");
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
  //
  // O nome do canal leva a instância: com a Vitrine ligada o sino monta duas
  // vezes (letreiro mobile e topbar de desktop, uma sempre oculta por CSS), e o
  // segundo `.on()` no mesmo canal já assinado derruba a tela inteira.
  useEffect(() => {
    if (!tenantId) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`notifications-realtime-${tenantId}-${instancia}`)
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
  }, [tenantId, instancia]);

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
        className={cn(
          // Alvo de toque 44px (regra 4) nos dois tons.
          "relative flex h-11 w-11 items-center justify-center rounded-xl border transition",
          tom === "escuro"
            ? "border-volt-800 bg-volt-900 text-paper-0 hover:border-cobalt-500"
            : "border-line-200 bg-paper-0 text-slate-600 hover:border-cobalt-500",
        )}
        aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ""}`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span
            className={cn(
              // Piso de 12px (regra 4): o círculo cresce de 16 pra 20px pra caber o número sem apertar.
              "font-data absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-cobalt-500 text-12 font-bold text-white ring-2",
              tom === "escuro" ? "ring-volt-950" : "ring-canvas-100",
            )}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-line-200 bg-paper-0 shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-line-200 px-4 py-3">
            <h3 className="font-display text-sm font-bold text-volt-950">Notificações</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-12 font-medium text-cobalt-500 transition hover:text-cobalt-700"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-13 text-slate-600">Carregando...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-2 text-13 text-slate-600">Nenhuma notificação ainda.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 border-b border-line-200 px-4 py-3 transition last:border-0",
                    !n.read_at && "bg-canvas-100",
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
                    <p className={cn("text-13", !n.read_at ? "font-medium text-volt-950" : "text-slate-600")}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-12 text-slate-600 line-clamp-2">{n.body}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-data text-12 text-slate-600">{timeAgo(n.created_at)}</span>
                      {n.href && (
                        <a
                          href={n.href}
                          className="inline-flex items-center gap-0.5 text-12 font-medium text-cobalt-500 hover:text-cobalt-700"
                        >
                          Ver <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                  {!n.read_at && (
                    <button
                      onClick={() => markAsRead([n.id])}
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-600 transition hover:bg-canvas-100 hover:text-cobalt-500"
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
