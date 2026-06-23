"use client";

import { useEffect, useState } from "react";
import { HeartPulse, Wifi, WifiOff, Gauge, Send, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Stats = {
  queue: { pendentes: number; enviadasHoje: number; pausada: boolean };
  delivery: { deliveryRate: number | null };
  warmup: { phase: "warming" | "graduated"; day: number; totalDays: number; todayLimit: number | string; todaySent: number };
};
type Session = { live: boolean; connectedSince: string | null; stats: Stats | null };

/** "conectado há X" legível a partir do ISO de início da sessão. */
function sinceLabel(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? "s" : ""}`;
}

type Health = { label: string; tone: "green" | "amber" | "red"; reason: string };

function assess(s: Session): Health {
  if (!s.live) return { label: "Desconectado", tone: "red", reason: "Rode a engine e escaneie o QR." };
  const rate = s.stats?.delivery.deliveryRate;
  if (rate !== null && rate !== undefined && rate < 0.6)
    return { label: "Atenção", tone: "red", reason: `Entrega em ${Math.round(rate * 100)}% — possível soft-ban. Pause os envios.` };
  if (s.stats?.queue.pausada) return { label: "Atenção", tone: "amber", reason: "Fila de envio pausada (circuit breaker)." };
  if (s.stats?.warmup.phase === "warming")
    return { label: "Aquecendo", tone: "amber", reason: `Número novo em warm-up (dia ${s.stats.warmup.day}/${s.stats.warmup.totalDays}). Volume baixo de propósito.` };
  return { label: "Saudável", tone: "green", reason: "Ritmo dentro dos limites seguros." };
}

const TONE = {
  green: { dot: "bg-green-500", text: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
  amber: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  red: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
} as const;

export function HealthCard() {
  const [s, setS] = useState<Session>({ live: false, connectedSince: null, stats: null });

  useEffect(() => {
    const load = () =>
      fetch("/api/session")
        .then((r) => r.json())
        .then((d) => setS({ live: !!d.live, connectedSince: d.connectedSince ?? null, stats: d.stats ?? null }))
        .catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const h = assess(s);
  const t = TONE[h.tone];
  const w = s.stats?.warmup;
  const limit = typeof w?.todayLimit === "number" ? w.todayLimit : null;
  const sent = w?.todaySent ?? 0;
  const pendentes = s.stats?.queue.pendentes ?? 0;
  const fila = s.live ? (pendentes === 0 ? "Normal" : String(pendentes)) : "—";
  const densityPct = limit ? Math.min(100, Math.round((sent / limit) * 100)) : 0;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-slate-400" />
          Saúde do número
        </CardTitle>
        <span className={`flex items-center gap-1.5 rounded-full ${t.bg} px-2.5 py-1 text-xs font-medium ${t.text}`}>
          <span className={`h-2 w-2 rounded-full ${t.dot}`} />
          {h.label}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex items-start gap-2 rounded-lg border ${t.border} ${t.bg} p-3 text-sm ${t.text}`}>
          {s.live ? <Wifi className="mt-0.5 h-4 w-4 shrink-0" /> : <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{h.reason}</span>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <Metric icon={Send} label="Envios hoje" value={String(sent)} />
          <Metric icon={Gauge} label="Fila" value={fila} />
          <Metric icon={Clock} label="Última conexão" value={s.live ? sinceLabel(s.connectedSince) : "—"} />
        </div>

        {limit !== null && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>Envios de hoje (limite seguro)</span>
              <span>
                {sent}/{limit}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${densityPct >= 90 ? "bg-amber-500" : "bg-green-500"}`}
                style={{ width: `${densityPct}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-3">
      <Icon className="mx-auto mb-1 h-4 w-4 text-slate-400" />
      <p className="text-base font-semibold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
