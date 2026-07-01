"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/painel/empty-state";

type Broadcast = {
  id: string;
  campaign_name: string;
  group_ids: string[] | null;
  status: string;
  sent_count: number | null;
  failed_count: number | null;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string;
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Send }> = {
  completed: { label: "Enviado", color: "bg-sucesso/10 text-sucesso", icon: CheckCircle2 },
  sending: { label: "Enviando", color: "bg-iris/10 text-iris", icon: Send },
  pending: { label: "Pendente", color: "bg-atencao/10 text-atencao", icon: Clock },
  failed: { label: "Falhou", color: "bg-alerta/10 text-alerta", icon: XCircle },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PainelDisparos() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "completed" | "pending" | "failed">("all");

  useEffect(() => {
    fetch("/api/broadcasts/history?limit=50")
      .then((r) => r.json())
      .then((d) => {
        setBroadcasts(d.items ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? broadcasts : broadcasts.filter((b) => b.status === filter)),
    [broadcasts, filter],
  );

  const stats = useMemo(() => {
    const sent = broadcasts.reduce((a, b) => a + (b.sent_count ?? 0), 0);
    const failed = broadcasts.reduce((a, b) => a + (b.failed_count ?? 0), 0);
    return { total: broadcasts.length, sent, failed };
  }, [broadcasts]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-white" />
        <div className="h-64 animate-pulse rounded-3xl bg-white" />
      </div>
    );
  }

  if (broadcasts.length === 0) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Disparos</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">Histórico de envios</p>
        <div className="mt-6">
          <EmptyState
            icon={Send}
            title="Nenhum disparo ainda"
            description="Crie uma campanha e agende seu primeiro disparo para os grupos."
            ctaLabel="Criar campanha"
            ctaHref="/painel/campanhas/nova"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Disparos</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
            {total} envios registrados
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Total enviados" value={stats.sent} />
        <KpiCard label="Falharam" value={stats.failed} tone="alerta" />
        <KpiCard label="Campanhas" value={stats.total} />
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "completed", "pending", "failed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition",
              filter === f
                ? "bg-breu text-white"
                : "bg-white text-aco/70 hover:bg-bruma",
            )}
          >
            {f === "all" ? "Todos" : f === "completed" ? "Enviados" : f === "pending" ? "Pendentes" : "Falhos"}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-3xl border border-breu/[0.08] bg-white">
        <div className="divide-y divide-breu/[0.06]">
          {filtered.map((b) => {
            const st = STATUS_MAP[b.status] ?? STATUS_MAP.pending;
            const Icon = st.icon;
            return (
              <div key={b.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-bruma/30">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", st.color)}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-breu">
                    {b.campaign_name || "Disparo sem nome"}
                  </p>
                  <p className="font-data mt-0.5 text-[11px] text-aco/55">
                    {b.group_ids?.length ?? 0} grupos · {formatDate(b.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-data text-sm font-medium text-breu">
                    {b.sent_count ?? 0} <span className="text-aco/40">enviados</span>
                  </p>
                  {(b.failed_count ?? 0) > 0 && (
                    <p className="font-data text-[11px] text-alerta">{b.failed_count} falhas</p>
                  )}
                </div>
                <span className={cn("font-data rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider", st.color)}>
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-breu/[0.08] bg-white px-4 py-4">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/55">{label}</p>
      <p className={cn("font-display mt-1 text-2xl font-extrabold tracking-tight", tone === "alerta" ? "text-alerta" : "text-breu")}>
        {value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
