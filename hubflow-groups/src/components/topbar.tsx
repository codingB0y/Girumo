"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { CampanhaSelector } from "@/components/campanha-selector";

type Session = { live: boolean; phone: string | null; profileName: string | null; connectedSince: string | null };

function sinceLabel(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const [s, setS] = useState<Session>({ live: false, phone: null, profileName: null, connectedSince: null });

  useEffect(() => {
    const load = () =>
      fetch("/api/session")
        .then((r) => r.json())
        .then((d) => setS({ live: !!d.live, phone: d.phone, profileName: d.profileName, connectedSince: d.connectedSince ?? null }))
        .catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/70 px-6 backdrop-blur-xl">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        <CampanhaSelector />
        {s.live ? (
          <div
            className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5"
            title={s.connectedSince ? `Conectado ${sinceLabel(s.connectedSince)}` : "Conectado"}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <Wifi className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700">{s.phone ?? "conectado"}</span>
            {s.connectedSince && (
              <span className="hidden text-xs text-green-600/70 sm:inline">· {sinceLabel(s.connectedSince)}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
            <WifiOff className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Desconectado</span>
          </div>
        )}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white shadow-brand">
          {(s.profileName ?? "?").slice(0, 1).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
