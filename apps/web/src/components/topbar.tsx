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
  if (min < 60) return `ha ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `ha ${h}h`;
  const d = Math.floor(h / 24);
  return `ha ${d} dia${d > 1 ? "s" : ""}`;
}

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const [session, setSession] = useState<Session>({
    live: false,
    phone: null,
    profileName: null,
    connectedSince: null,
  });

  useEffect(() => {
    const load = () =>
      fetch("/api/session")
        .then((response) => response.json())
        .then((data) =>
          setSession({
            live: Boolean(data.live),
            phone: data.phone,
            profileName: data.profileName,
            connectedSince: data.connectedSince ?? null,
          }),
        )
        .catch(() => {});

    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="truncate text-sm text-slate-400">{subtitle}</p>}
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="hidden lg:block">
          <CampanhaSelector />
        </div>

        {session.live ? (
          <div
            className="flex min-w-0 items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5"
            title={session.connectedSince ? `Conectado ${sinceLabel(session.connectedSince)}` : "Conectado"}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <Wifi className="h-3.5 w-3.5 text-green-600" />
            <span className="hidden max-w-32 truncate text-xs font-medium text-green-700 sm:inline">
              {session.phone ?? "conectado"}
            </span>
            {session.connectedSince && (
              <span className="hidden text-xs text-green-600/70 sm:inline">- {sinceLabel(session.connectedSince)}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <WifiOff className="h-3.5 w-3.5 text-slate-400" />
            <span className="hidden text-xs font-medium text-slate-500 sm:inline">Desconectado</span>
          </div>
        )}

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
          {(session.profileName ?? "?").slice(0, 1).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
