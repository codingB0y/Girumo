"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Send,
  MoreHorizontal,
  Users,
  Sparkles,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "Ativo" | "Lotado" | "Campanha" | "Atenção";

type Group = {
  name: string;
  members: number;
  capacity: number;
  status: Status;
  tags: string[];
  saude: number; // 0-100
  last: string;
};

const GROUPS: Group[] = [
  { name: "Atacado Premium SP", members: 312, capacity: 320, status: "Lotado", tags: ["VIP", "Brás"], saude: 88, last: "há 2h" },
  { name: "Loja Distribuidora Norte", members: 198, capacity: 256, status: "Ativo", tags: ["Atacado"], saude: 72, last: "há 5h" },
  { name: "Clientes VIP Sul", members: 87, capacity: 256, status: "Campanha", tags: ["VIP"], saude: 64, last: "ontem" },
  { name: "Revenda Moda Brás", members: 243, capacity: 256, status: "Ativo", tags: ["Brás", "Moda"], saude: 79, last: "há 1h" },
  { name: "Madrugadão Outlet", members: 156, capacity: 256, status: "Atenção", tags: ["Outlet"], saude: 28, last: "há 4 dias" },
  { name: "Lançamentos Inverno", members: 201, capacity: 256, status: "Ativo", tags: ["Lançamento"], saude: 81, last: "há 3h" },
  { name: "Revendedoras Ouro", members: 134, capacity: 256, status: "Campanha", tags: ["VIP", "Ouro"], saude: 69, last: "há 6h" },
  { name: "Mega Moda Promo", members: 118, capacity: 256, status: "Atenção", tags: ["Promo"], saude: 34, last: "há 3 dias" },
];

const FILTERS = ["Todos", "Ativos", "Lotados", "Atenção"] as const;
type Filter = (typeof FILTERS)[number];

export default function PainelGrupos() {
  const [filter, setFilter] = useState<Filter>("Todos");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      Todos: GROUPS.length,
      Ativos: GROUPS.filter((g) => g.status === "Ativo" || g.status === "Campanha").length,
      Lotados: GROUPS.filter((g) => g.status === "Lotado").length,
      Atenção: GROUPS.filter((g) => g.status === "Atenção").length,
    }),
    [],
  );

  const rows = useMemo(() => {
    return GROUPS.filter((g) => {
      const byFilter =
        filter === "Todos"
          ? true
          : filter === "Ativos"
            ? g.status === "Ativo" || g.status === "Campanha"
            : filter === "Lotados"
              ? g.status === "Lotado"
              : g.status === "Atenção";
      const byQuery = g.name.toLowerCase().includes(q.toLowerCase());
      return byFilter && byQuery;
    });
  }, [filter, q]);

  const totalMembers = GROUPS.reduce((a, g) => a + g.members, 0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Grupos</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
            Gestão e crescimento dos seus grupos VIP
          </p>
        </div>
        <div className="flex gap-2.5">
          <button className="inline-flex items-center gap-2 rounded-xl border border-breu/15 bg-white px-4 py-2.5 text-sm font-medium text-breu transition hover:border-iris hover:text-iris">
            <Sparkles className="h-4 w-4" /> Lotar grupos
          </button>
          <button className="group inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro">
            <Plus className="h-4 w-4" /> Novo grupo
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Grupos" value={String(GROUPS.length)} />
        <MiniStat label="Membros totais" value={totalMembers.toLocaleString("pt-BR")} />
        <MiniStat label="Lotados" value={String(counts.Lotados)} tone="iris" />
        <MiniStat label="Precisam atenção" value={String(counts["Atenção"])} tone="atencao" />
      </div>

      {/* Filtros + busca */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-breu/10 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
                filter === f ? "bg-breu text-white" : "text-aco/70 hover:text-breu",
              )}
            >
              {f}
              <span className={cn("font-data ml-1.5 text-[11px]", filter === f ? "text-bruma/60" : "text-aco/40")}>
                {counts[f]}
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

      {/* Tabela */}
      <div className="overflow-hidden rounded-3xl border border-breu/[0.08] bg-white">
        <div className="hidden border-b border-breu/[0.06] bg-bruma/40 px-5 py-3 md:grid md:grid-cols-[1.6fr_0.8fr_1fr_0.8fr_auto] md:gap-4">
          {["Grupo", "Membros", "Saúde da conversa", "Status", ""].map((h) => (
            <span key={h} className="font-data text-[10px] uppercase tracking-wider text-aco/50">
              {h}
            </span>
          ))}
        </div>

        <div className="divide-y divide-breu/[0.06]">
          {rows.map((g) => (
            <div
              key={g.name}
              className="group grid grid-cols-1 gap-3 px-5 py-4 transition hover:bg-bruma/30 md:grid-cols-[1.6fr_0.8fr_1fr_0.8fr_auto] md:items-center md:gap-4"
            >
              {/* Grupo + tags */}
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-iris/10 text-iris">
                  <Users className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-breu">{g.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {g.tags.map((t) => (
                      <span
                        key={t}
                        className="font-data rounded-md bg-bruma px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-aco/60"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Membros */}
              <div>
                <p className="font-data text-sm tabular-nums text-breu">
                  {g.members}
                  <span className="text-aco/40"> / {g.capacity}</span>
                </p>
                <p className="font-data text-[10px] uppercase tracking-wider text-aco/40">
                  última: {g.last}
                </p>
              </div>

              {/* Saúde */}
              <Health value={g.saude} />

              {/* Status */}
              <div>
                <StatusPill status={g.status} />
              </div>

              {/* Ações */}
              <div className="flex items-center gap-1 md:justify-end">
                <button className="inline-flex items-center gap-1.5 rounded-lg bg-iris/10 px-3 py-1.5 text-xs font-medium text-iris transition hover:bg-iris hover:text-white">
                  <Send className="h-3.5 w-3.5" /> Disparar
                </button>
                <button className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/40 transition hover:bg-bruma hover:text-breu">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div className="px-5 py-16 text-center">
              <p className="font-display text-lg font-bold text-breu">Nenhum grupo aqui</p>
              <p className="mt-1 text-sm text-aco/60">Ajuste o filtro ou a busca.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- partes ---------- */

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "iris" | "atencao" }) {
  return (
    <div className="rounded-2xl border border-breu/[0.08] bg-white px-4 py-3.5">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p
        className={cn(
          "font-display mt-1 text-2xl font-extrabold tracking-tight",
          tone === "iris" ? "text-iris" : tone === "atencao" ? "text-atencao" : "text-breu",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Health({ value }: { value: number }) {
  const tone = value >= 60 ? "sucesso" : value >= 35 ? "atencao" : "alerta";
  const label = value >= 60 ? "Alta" : value >= 35 ? "Média" : "Baixa";
  const color = tone === "sucesso" ? "#1E8E5A" : tone === "atencao" ? "#D99B2A" : "#D84040";
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-bruma">
          <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
        </div>
        <Activity className="h-3.5 w-3.5 shrink-0" style={{ color }} />
      </div>
      <p className="font-data mt-1 text-[10px] uppercase tracking-wider" style={{ color }}>
        {label}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    Ativo: "bg-sucesso/10 text-sucesso",
    Lotado: "bg-iris/10 text-iris-escuro",
    Campanha: "bg-iris/[0.07] text-iris",
    Atenção: "bg-atencao/10 text-atencao",
  };
  return (
    <span
      className={cn(
        "font-data inline-block rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider",
        map[status],
      )}
    >
      {status}
    </span>
  );
}
