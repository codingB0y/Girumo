"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";
import { GroupSettings } from "@/components/painel/grupos/group-settings";
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
  full: { label: "Cheio", pill: "bg-cobalt-500/10 text-cobalt-700" },
  missing_invite: { label: "Sem convite", pill: "bg-atencao/10 text-atencao" },
  unknown: { label: "—", pill: "bg-poco text-aco/60" },
};

// Coluna "Saúde" removida: os 85/50/22 eram literais sobre `engagement`, que o
// servidor devolve fixo em "medio" para TODO grupo — ou seja, um número que não
// media nada. A ocupação (membros/capacidade), essa sim real, continua na coluna
// Membros. Volta quando a engine reportar sinal de engajamento de verdade.

export default function PainelGrupos() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");
  const [filter, setFilter] = useState<"all" | CampaignGroupStatus>("all");
  const [q, setQ] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/groups", { cache: "no-store" });
    const data = await res.json();
    setGroups(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    loadGroups()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadGroups]);

  /**
   * Importa os grupos da instância conectada.
   *
   * O sync é explícito porque a Evolution só avisa por webhook sobre grupos
   * criados DEPOIS da conexão (`groups.upsert`) — os que já existiam precisam
   * de um fetch. Também roda sozinho ao conectar, em /painel/conectar.
   */
  const syncGroups = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/groups/sync", { method: "POST" });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? "Nao foi possivel sincronizar.");
      }
      await loadGroups();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [loadGroups]);

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
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Grupos</h1>
          <p className="font-editorial mt-1 text-[19px] italic text-ardosia">
            Seus grupos, sincronizados direto do WhatsApp.
          </p>
          {syncError && <p className="mt-2 text-sm text-alerta">{syncError}</p>}
        </div>
        <button
          type="button"
          onClick={syncGroups}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          {syncing ? "Sincronizando…" : "Sincronizar grupos"}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat label="Grupos" value={String(groups.length)} />
        <MiniStat label="Membros totais" value={totalMembers.toLocaleString("pt-BR")} />
        <MiniStat label="Cheios" value={String(counts.full ?? 0)} tone="cobalt" />
        <MiniStat label="Sem convite" value={String(counts.missing_invite ?? 0)} tone="atencao" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-volt-950/10 bg-papel p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "cursor-pointer rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors duration-[160ms]",
                filter === f.value ? "bg-volt-950 text-white" : "text-aco/70 hover:text-volt-950",
              )}
            >
              {f.label}
              <span className={cn("font-data ml-1.5 text-[11px] tabular-nums", filter === f.value ? "text-canvas-100/60" : "text-aco/40")}>
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
            aria-label="Buscar grupo"
            className="w-full rounded-[10px] border border-volt-950/10 bg-poco py-2.5 pl-9 pr-3 text-sm text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] placeholder:text-aco/40 focus:border-cobalt-500/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)] sm:w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="pn-skeleton h-80 rounded-2xl" />
      ) : (
        <div className="pn-card overflow-hidden rounded-2xl">
          <div className="hidden border-b border-volt-950/[0.06] bg-poco px-5 py-3 md:grid md:grid-cols-[1.8fr_1fr_0.8fr_auto] md:gap-4">
            {["Grupo", "Membros", "Status", ""].map((h) => (
              <span key={h} className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">{h}</span>
            ))}
          </div>
          {/* régua de romaneio: separadores tracejados */}
          <div className="divide-y divide-dashed divide-volt-950/[0.09]">
            {rows.map(({ g, status }) => {
              const cap = g.capacity > 0 ? Math.round((g.members / g.capacity) * 100) : 0;
              const invite = g.inviteUrl
                ? origin && !g.inviteUrl.startsWith("http")
                  ? `${origin}${g.inviteUrl}`
                  : g.inviteUrl
                : "";
              return (
                <div
                  key={g.id}
                  className="grid grid-cols-1 gap-3 px-5 py-4 transition-colors duration-[160ms] hover:bg-poco md:grid-cols-[1.8fr_1fr_0.8fr_auto] md:items-center md:gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cobalt-500/10 text-cobalt-500">
                      <Users className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </span>
                    <p className="truncate text-sm font-medium text-volt-950">{g.name}</p>
                    {/* Sem ser admin não dá pra disparar no grupo — melhor dizer
                        isso aqui do que deixar a campanha falhar em silêncio. */}
                    {g.isAdmin === false && (
                      <span className="font-data shrink-0 rounded-full bg-poco px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-aco/60">
                        não admin
                      </span>
                    )}
                    {g.isAdmin && (
                      <ShieldCheck
                        className="h-4 w-4 shrink-0 text-sucesso"
                        strokeWidth={1.75}
                        aria-label="Você é admin deste grupo"
                      />
                    )}
                  </div>
                  <div>
                    <p className="font-data text-sm tabular-nums text-volt-950">
                      {(g.members ?? 0).toLocaleString("pt-BR")}<span className="text-aco/40"> / {(g.capacity ?? 0).toLocaleString("pt-BR")}</span>
                    </p>
                    <div className="pn-poco mt-1.5 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full">
                      <div
                        className="pn-fill h-full w-full rounded-full"
                        style={{ transform: `scaleX(${Math.max(cap / 100, 0.02)})`, background: cap >= 80 ? "#D99B2A" : "var(--color-cobalt-500)" }}
                      />
                    </div>
                  </div>
                  <div>
                    <span className={cn("font-data inline-block rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.06em]", STATUS[status].pill)}>
                      {STATUS[status].label}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-self-end">
                    {invite ? <CopyLink url={invite} /> : null}
                    {status === "available" && (
                      <Link
                        href={`/painel/campanhas/nova?groups=${encodeURIComponent(g.id)}`}
                        className="rounded-lg px-2 py-1 text-[12px] text-cobalt-700 transition-colors duration-[160ms] hover:bg-cobalt-500/10"
                      >
                        Criar campanha
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing((cur) => (cur === g.id ? null : g.id))}
                      aria-expanded={editing === g.id}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-volt-950/10 px-2.5 py-1.5 text-[12px] transition-colors duration-[160ms]",
                        invite ? "text-aco/70 hover:text-volt-950" : "border-atencao/40 text-atencao hover:bg-atencao/5",
                      )}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {invite ? "Configurar" : "Adicionar convite"}
                    </button>
                  </div>
                  {editing === g.id && (
                    <GroupSettings
                      groupId={g.id}
                      inviteUrl={g.inviteUrl}
                      capacity={g.capacity}
                      onSaved={loadGroups}
                      onClose={() => setEditing(null)}
                    />
                  )}
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="px-5 py-16 text-center">
                <p className="font-editorial text-[22px] italic text-volt-950">
                  {groups.length === 0 ? "Nenhum grupo sincronizado ainda." : "Nenhum grupo por aqui."}
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

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "cobalt" | "atencao" }) {
  return (
    <div className="pn-card rounded-2xl px-4 py-3.5">
      <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">{label}</p>
      <p
        className={cn(
          "font-data mt-2 text-[26px] font-medium tabular-nums tracking-[-0.02em]",
          tone === "cobalt" ? "text-cobalt-500" : tone === "atencao" ? "text-atencao" : "text-volt-950",
        )}
      >
        {value}
      </p>
    </div>
  );
}
