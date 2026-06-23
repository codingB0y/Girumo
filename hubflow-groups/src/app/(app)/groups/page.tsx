"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, Users, CheckCheck } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type Engagement, type Group } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const engagementTone: Record<Engagement, "green" | "amber" | "slate"> = {
  alto: "green",
  medio: "amber",
  baixo: "slate",
};

const engagementLabel: Record<Engagement, string> = {
  alto: "Engaj. alto",
  medio: "Engaj. médio",
  baixo: "Engaj. baixo",
};

function KpiChip({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: number;
  tone: "slate" | "emerald" | "amber";
  loading?: boolean;
}) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-slate-900";
  return (
    <Card className="p-3">
      <p className="text-xs text-slate-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-10" />
      ) : (
        <p className={cn("mt-0.5 text-xl font-semibold tabular-nums", color)}>{value}</p>
      )}
    </Card>
  );
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [query, setQuery] = useState("");
  const [live, setLive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false); // 1º fetch concluído (mostra skeleton até lá)

  // Lê grupos reais sincronizados pela engine; cai no mock se ainda não houver sync.
  async function load() {
    setSyncing(true);
    try {
      const data: Group[] = await fetch("/api/groups").then((r) => r.json());
      if (Array.isArray(data) && data.length > 0) {
        setGroups(data);
        setLive(true);
      }
    } catch {
      // mantém o que já tem
    } finally {
      setSyncing(false);
      setLoaded(true);
    }
  }

  // Busca ao abrir + auto-refresh a cada 10s (vê novos grupos sem F5).
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(
    () =>
      groups
        .filter((g) => g.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.members - a.members), // maiores primeiro
    [groups, query],
  );

  const selectedCount = groups.filter((g) => g.selected).length;
  const selectedMembers = groups
    .filter((g) => g.selected)
    .reduce((sum, g) => sum + g.members, 0);

  // Lotação (paridade com o painel do DevZapp): cheio ≥ 95% da capacidade (cap ~1024 do WhatsApp).
  const cheios = groups.filter((g) => g.members / Math.max(1, g.capacity) >= 0.95).length;
  const disponiveis = groups.length - cheios;

  function toggle(id: string) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, selected: !g.selected } : g)));
  }

  function toggleAll() {
    const allSelected = filtered.every((g) => g.selected);
    const ids = new Set(filtered.map((g) => g.id));
    setGroups((prev) => prev.map((g) => (ids.has(g.id) ? { ...g, selected: !allSelected } : g)));
  }

  return (
    <>
      <Topbar
        title="Grupos"
        subtitle={live ? "Grupos reais onde você é admin" : "Aguardando sincronização da engine"}
      />
      <main className="flex-1 space-y-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Buscar grupo..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleAll}>
              <CheckCheck className="h-4 w-4" />
              Selecionar todos
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={syncing}>
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </Button>
          </div>
        </div>

        {/* Lotação dos grupos (cheios x disponíveis) — base do "lotar sozinho" */}
        <div className="grid grid-cols-3 gap-3">
          <KpiChip label="Grupos" value={groups.length} tone="slate" loading={!loaded} />
          <KpiChip label="Disponíveis" value={disponiveis} tone="emerald" loading={!loaded} />
          <KpiChip label="Cheios" value={cheios} tone="amber" loading={!loaded} />
        </div>

        {selectedCount > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm text-green-800">
              <span className="font-semibold">{selectedCount}</span> grupos selecionados ·{" "}
              <span className="font-semibold">{selectedMembers.toLocaleString("pt-BR")}</span> membros
              no alcance
            </p>
            <a href="/campaigns">
              <Button size="sm">Criar campanha</Button>
            </a>
          </div>
        )}

        <Card className="divide-y divide-slate-100">
          {!loaded &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={`sk-${i}`} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-5 w-5 rounded-md" />
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          {filtered.map((g) => {
            const pct = Math.min(100, Math.round((g.members / Math.max(1, g.capacity)) * 100));
            const barColor = pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
            return (
            <button
              key={g.id}
              onClick={() => toggle(g.id)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
            >
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                  g.selected ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300",
                )}
              >
                {g.selected && <CheckCheck className="h-3.5 w-3.5" />}
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-slate-900">{g.name}</p>
                  <Badge tone={engagementTone[g.engagement]}>{engagementLabel[g.engagement]}</Badge>
                </div>
                <p className="truncate text-xs text-slate-400">{g.whatsappGroupId}</p>
              </div>
              <div className="w-28 shrink-0">
                <div className="flex items-baseline justify-end gap-1">
                  <span className="text-sm font-medium text-slate-700">{g.members.toLocaleString("pt-BR")}</span>
                  <span className="text-xs text-slate-400">/ {g.capacity}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" title={`${pct}% da capacidade`}>
                  <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            </button>
            );
          })}
          {loaded && filtered.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Nenhum grupo encontrado.</p>
          )}
        </Card>
      </main>
    </>
  );
}
