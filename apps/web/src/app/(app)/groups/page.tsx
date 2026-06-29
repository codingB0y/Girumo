"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, Users, CheckCheck, Pencil } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { getGroupDisplayName, hasInternalGroupName } from "@/lib/group-display-name";
import { type Engagement, type Group } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type GroupFilter = "all" | "unnamed" | "available" | "full";

const groupFilters: Array<{ value: GroupFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "unnamed", label: "Sem nome interno" },
  { value: "available", label: "Disponiveis" },
  { value: "full", label: "Cheios" },
];

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
  const color = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-breu";
  return (
    <Card className="p-3">
      <p className="text-xs text-aco/70">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-10" />
      ) : (
        <p className={cn("mt-0.5 text-xl font-semibold tabular-nums", color)}>{value}</p>
      )}
    </Card>
  );
}

export default function GroupsPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GroupFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [displayNameBase, setDisplayNameBase] = useState("");
  const [displayNumber, setDisplayNumber] = useState("");
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
        .filter((g) => {
          const pct = g.members / Math.max(1, g.capacity);
          if (filter === "unnamed") return !hasInternalGroupName(g);
          if (filter === "available") return pct < 0.95;
          if (filter === "full") return pct >= 0.95;
          return true;
        })
        .sort((a, b) => b.members - a.members), // maiores primeiro
    [groups, query, filter],
  );

  const selectedCount = groups.filter((g) => g.selected).length;
  const selectedMembers = groups
    .filter((g) => g.selected)
    .reduce((sum, g) => sum + g.members, 0);

  // Lotação (paridade com o painel do HUBFLOW): cheio ≥ 95% da capacidade (cap ~1024 do WhatsApp).
  const cheios = groups.filter((g) => g.members / Math.max(1, g.capacity) >= 0.95).length;
  const disponiveis = groups.length - cheios;
  const namedCount = groups.filter((g) => hasInternalGroupName(g)).length;
  const unnamedCount = groups.length - namedCount;

  function toggle(id: string) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, selected: !g.selected } : g)));
  }

  function toggleAll() {
    const allSelected = filtered.every((g) => g.selected);
    const ids = new Set(filtered.map((g) => g.id));
    setGroups((prev) => prev.map((g) => (ids.has(g.id) ? { ...g, selected: !allSelected } : g)));
  }

  function startEdit(group: Group) {
    setEditingId(group.id);
    setDisplayNameBase(group.displayNameBase ?? "");
    setDisplayNumber(group.displayNumber ? String(group.displayNumber) : "");
  }

  function cancelEdit() {
    setEditingId(null);
    setDisplayNameBase("");
    setDisplayNumber("");
  }

  async function saveGroupName(group: Group) {
    try {
      const response = await fetch("/api/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: group.whatsappGroupId,
          displayNameBase,
          displayNumber: displayNumber ? Number(displayNumber) : 0,
        }),
      });
      if (!response.ok) throw new Error("PATCH failed");
      const updated = await response.json();
      setGroups((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      cancelEdit();
      toast("Nome interno salvo");
    } catch {
      toast("Nao foi possivel salvar o nome interno", "error");
    }
  }

  return (
    <>
      <Topbar
        title="Grupos"
        subtitle={live ? "Grupos reais onde você é admin" : "Aguardando sincronização da engine"}
      />
      <main className="flex-1 space-y-4 p-6">
        <Card className="border-iris/20 bg-iris/10/70 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-breu">Organize seus grupos para campanhas</p>
              <p className="mt-1 text-sm text-aco">
                De nomes simples como Promocoes 1, Promocoes 2 ou VIP 1 para evitar escolher grupo errado.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:min-w-64">
              <div className="rounded-lg bg-white px-3 py-2 shadow-card">
                <p className="text-xs text-aco/70">Organizados</p>
                <p className="text-lg font-semibold text-green-700">{namedCount}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 shadow-card">
                <p className="text-xs text-aco/70">Faltam nome</p>
                <p className="text-lg font-semibold text-amber-700">{unnamedCount}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aco/50" />
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

        <div className="flex flex-wrap gap-2">
          {groupFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                filter === item.value
                  ? "border-iris bg-iris text-white"
                  : "border-breu/10 bg-white text-aco hover:border-aco/30",
              )}
            >
              {item.label}
            </button>
          ))}
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
            <Link href="/campanhas">
              <Button size="sm">Criar campanha</Button>
            </Link>
          </div>
        )}

        <Card className="divide-y divide-bruma">
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
            const editing = editingId === g.id;
            return (
              <div key={g.id} className="px-5 py-4 transition-colors hover:bg-bruma">
                <div className="flex w-full items-center gap-4 text-left">
                  <button
                    type="button"
                    onClick={() => toggle(g.id)}
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      g.selected ? "border-iris bg-iris text-white" : "border-aco/30",
                    )}
                    aria-label="Selecionar grupo"
                  >
                    {g.selected && <CheckCheck className="h-3.5 w-3.5" />}
                  </button>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bruma text-aco/70">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-breu">{getGroupDisplayName(g)}</p>
                      <Badge tone={engagementTone[g.engagement]}>{engagementLabel[g.engagement]}</Badge>
                    </div>
                    <p className="truncate text-xs text-aco/50">
                      {hasInternalGroupName(g) ? `WhatsApp: ${g.name}` : g.whatsappGroupId}
                    </p>
                  </div>
                  <div className="w-28 shrink-0">
                    <div className="flex items-baseline justify-end gap-1">
                      <span className="text-sm font-medium text-aco">{g.members.toLocaleString("pt-BR")}</span>
                      <span className="text-xs text-aco/50">/ {g.capacity}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bruma" title={`${pct}% da capacidade`}>
                      <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(g)}>
                    <Pencil className="h-4 w-4" />
                    Organizar nome
                  </Button>
                </div>
                {editing && (
                  <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-iris/20 bg-iris/10/60 p-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-aco">Nome interno</label>
                      <Input value={displayNameBase} onChange={(event) => setDisplayNameBase(event.target.value)} placeholder="Ex: Promocoes" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-aco">Numero</label>
                      <Input
                        type="number"
                        min={1}
                        value={displayNumber}
                        onChange={(event) => setDisplayNumber(event.target.value)}
                        placeholder="1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
                        Cancelar
                      </Button>
                      <Button type="button" size="sm" onClick={() => saveGroupName(g)}>
                        Salvar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {loaded && filtered.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-aco/50">Nenhum grupo encontrado.</p>
          )}
        </Card>
      </main>
    </>
  );
}
