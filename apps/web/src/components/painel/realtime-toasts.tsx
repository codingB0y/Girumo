"use client";

import { useEffect, useState } from "react";
import { Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Toast = {
  id: string;
  message: string;
  type: "lead" | "group_full" | "broadcast_done";
  createdAt: number;
};

const TYPE_CONFIG = {
  lead: { bg: "bg-sucesso/10 border-sucesso/20", text: "text-sucesso", icon: Users },
  group_full: { bg: "bg-atencao/10 border-atencao/20", text: "text-atencao", icon: Users },
  broadcast_done: { bg: "bg-cobalt-500/10 border-cobalt-500/20", text: "text-cobalt-500", icon: Users },
};

export function RealtimeToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel("realtime-leads")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          const lead = payload.new as { name?: string; phone?: string; source_group?: string };
          const name = lead.name || lead.phone || "Alguém";
          const group = lead.source_group || "um grupo";
          const toast: Toast = {
            id: `lead-${Date.now()}-${Math.random()}`,
            message: `🟢 ${name} entrou em ${group}`,
            type: "lead",
            createdAt: Date.now(),
          };
          setToasts((prev) => [toast, ...prev].slice(0, 5));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-remove after 5s
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      setToasts((prev) => prev.filter((t) => Date.now() - t.createdAt < 5000));
    }, 1000);
    return () => clearInterval(timer);
  }, [toasts.length]);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 lg:bottom-4">
      {toasts.map((toast) => {
        const config = TYPE_CONFIG[toast.type];
        const Icon = config.icon;
        return (
          <div
            key={toast.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-right-5 duration-300",
              config.bg,
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", config.text)} />
            <p className="text-sm font-medium text-volt-950">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              className="ml-2 shrink-0 text-aco/40 transition hover:text-volt-950"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
