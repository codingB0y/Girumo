"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Users, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";
import { getCampaignGroupStatus, type CampaignGroupStatus } from "@/lib/campaign-groups-overview";
import type { Group } from "@/lib/mock-data";

const FILTERS: { value: "all" | CampaignGroupStatus; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "available", label: "Ativos" },
  { value: "full", label: "Cheios" },
  { value: "missing_invite", label: "Sem convite" },
];

const STATUS: Record<CampaignGroupStatus, { label: string; pill: string }> = {
  available: { label: "Ativo", pill: "bg-sucesso/10 text-sucesso" },
  full: { label: "Cheio", pill: "bg-iris/10 text-iris-escuro" },
  missing_invite: { label: "Sem convite", pill: "bg-atencao/10 text-atencao" },
  unknown: { label: "—", pill: "bg-bruma text-aco/60" },
};

const HEALTH: Record<string, { label: string; pct: number; color: string }> = {
  alto: { label: "Alta", pct: 85, color: "#1E8E5A" },
  medio: { label: "Média", pct: 50, color: "#D99B2A" },
  baixo: { label: "Baixa", pct: 22, color: "#D84040" },
};

export default function PainelGrupos() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");
  const [filter, setFilter] = useState<"all" | CampaignGroupStatus>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/groups")
      .then((r) => r.json())
      .then((g) => setGroups(Array.isArray(g) ? g : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const withStatus = useMemo(
    () => groups.map((g) => ({ g, status: getCampaignGroupStatus(g) })),
    [groups],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: withStatus.length };
    for (const x of withStatus) c[x.status] = (c[x.status] ?? 0) + 1;
    return c;
  }, [withStatus]);

  const rows = useMemo(
    () =>
      withStatus.filter(
        (x) =>
          (filter === "all" || x.status === filter) &&
          x.g.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [withStatus, filter, q],
  );

  const totalMembers = groups.reduce((a, g) => a + (g.members ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Grupos</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Seus grupos sincronizados do WhatsApp
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Grupos" value={String(groups.length)} />
        <MiniStat label="Membros totais" value={totalMembers.toLocaleString("pt-BR")} />
        <MiniStat label="Cheios" value={String(counts.full ?? 0)} tone="iris" />
        <MiniStat label="Sem convite" value={String(counts.missing_invite ?? 0)} tone="atencao" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-breu/10 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
                filter === f.value ? "bg-breu text-white" : "text-aco/70 hover:text-breu",
              )}
            >
              {f.label}
              <span className={cn("font-data ml-1.5 text-[11px]", filter === f.value ? "text-bruma/60" : "text-aco/40")}>
                {counts[f.value] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aco/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar grupo…"
            className="w-full rounded-xl border border-breu/10 bg-white py-2.5 pl-9 pr-3 text-sm text-breu outline-none transition placeholder:text-aco/40 focus:border-iris/40 focus:ring-4 focus:ring-iris/10 sm:w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="h-80 animate-pulse rounded-3xl border border-breu/[0.08] bg-white" />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-breu/[0.08] bg-white">
          <div className="hidden border-b border-breu/[0.06] bg-bruma/40 px-5 py-3 md:grid md:grid-cols-[1.6fr_0.9fr_0.9fr_0.7fr_auto] md:gap-4">
            {["Grupo", "Membros", "Saúde", "Status", ""].map((h) => (
              <span key={h} className="font-data text-[10px] uppercase tracking-wider text-aco/50">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-breu/[0.06]">
            {rows.map(({ g, status }) => {
              const cap = g.capacity > 0 ? Math.round((g.members / g.capacity) * 100) : 0;
              const h = HEALTH[g.engagement] ?? HEALTH.medio;
              const invite = g.inviteUrl
                ? origin && !g.inviteUrl.startsWith("http")
                  ? `${origin}${g.inviteUrl}`
                  : g.inviteUrl
                : "";
              return (
                <div
                  key={g.id}
                  className="grid grid-cols-1 gap-3 px-5 py-4 transition hover:bg-bruma/30 md:grid-cols-[1.6fr_0.9fr_0.9fr_0.7fr_auto] md:items-center md:gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-iris/10 text-iris">
                      <Users className="h-[18px] w-[18px]" />
                    </span>
                    <p className="truncate text-sm font-medium text-breu">{g.name}</p>
                  </div>
                  <div>
                    <p className="font-data text-sm tabular-nums text-breu">
                      {(g.members ?? 0).toLocaleString("pt-BR")}<span className="text-aco/40"> / {(g.capacity ?? 0).toLocaleString("pt-BR")}</span>
                    </p>
                    <div className="mt-1 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-bruma">
                      <div className="h-full rounded-full" style={{ width: `${cap}%`, background: cap >= 80 ? "#D99B2A" : "#6A4BF0" }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 shrink-0" style={{ color: h.color }} />
                    <span className="font-data text-[11px] uppercase tracking-wider" style={{ color: h.color }}>{h.label}</span>
                  </div>
                  <div>
                    <span className={cn("font-data inline-block rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider", STATUS[status].pill)}>
                      {STATUS[status].label}
                    </span>
                  </div>
                  <div className="md:justify-self-end">
                    {invite ? (
                      <CopyLink url={invite} />
                    ) : (
                      <span className="font-data text-[11px] text-atencao">sem convite</span>
                    )}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="px-5 py-16 text-center">
                <p className="font-display text-lg font-bold text-breu">
                  {groups.length === 0 ? "Nenhum grupo sincronizado" : "Nenhum grupo aqui"}
                </p>
                <p className="mt-1 text-sm text-aco/60">
                  {groups.length === 0 ? "Conecte o WhatsApp e os grupos aparecem aqui." : "Ajuste o filtro ou a busca."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "iris" | "atencao" }) {
  return (
    <div className="rounded-2xl border border-breu/[0.08] bg-white px-4 py-3.5">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p className={cn("font-display mt-1 text-2xl font-extrabold tracking-tight", tone === "iris" ? "text-iris" : tone === "atencao" ? "text-atencao" : "text-breu")}>
        {value}
      </p>
    </div>
  );
}
