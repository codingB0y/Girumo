"use client";

import { useMemo, useState } from "react";
import { Search, Send, MoreHorizontal, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "Novo" | "Ativo" | "Cliente" | "Sumiu";

type Contact = {
  name: string;
  phone: string;
  group: string;
  status: Status;
  last: string;
  spent: string;
};

const CONTACTS: Contact[] = [
  { name: "Ana Paula", phone: "11 9xxxx-1234", group: "Atacado Premium SP", status: "Cliente", last: "há 2h", spent: "R$ 1.240" },
  { name: "Juliana Mendes", phone: "11 9xxxx-5678", group: "Revenda Moda Brás", status: "Novo", last: "há 1h", spent: "—" },
  { name: "Carla Souza", phone: "11 9xxxx-9012", group: "Clientes VIP Sul", status: "Sumiu", last: "há 12 dias", spent: "R$ 480" },
  { name: "Patrícia Lima", phone: "11 9xxxx-3456", group: "Atacado Premium SP", status: "Ativo", last: "há 3h", spent: "R$ 320" },
  { name: "Fernanda Rocha", phone: "11 9xxxx-7890", group: "Lançamentos Inverno", status: "Cliente", last: "ontem", spent: "R$ 2.100" },
  { name: "Beatriz Gomes", phone: "11 9xxxx-2345", group: "Madrugadão Outlet", status: "Sumiu", last: "há 8 dias", spent: "R$ 150" },
  { name: "Mariana Teles", phone: "11 9xxxx-6789", group: "Revenda Moda Brás", status: "Novo", last: "há 30min", spent: "—" },
  { name: "Sandra Vieira", phone: "11 9xxxx-0123", group: "Clientes VIP Sul", status: "Cliente", last: "há 5h", spent: "R$ 890" },
];

const STATUS: Record<Status, string> = {
  Novo: "bg-iris/[0.07] text-iris",
  Ativo: "bg-sucesso/10 text-sucesso",
  Cliente: "bg-sucesso/10 text-sucesso",
  Sumiu: "bg-alerta/10 text-alerta",
};

const FILTERS = ["Todos", "Novos", "Clientes", "Sumiram"] as const;
type Filter = (typeof FILTERS)[number];

export default function PainelContatos() {
  const [filter, setFilter] = useState<Filter>("Todos");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      Todos: CONTACTS.length,
      Novos: CONTACTS.filter((c) => c.status === "Novo").length,
      Clientes: CONTACTS.filter((c) => c.status === "Cliente").length,
      Sumiram: CONTACTS.filter((c) => c.status === "Sumiu").length,
    }),
    [],
  );

  const rows = useMemo(
    () =>
      CONTACTS.filter((c) => {
        const byFilter =
          filter === "Todos"
            ? true
            : filter === "Novos"
              ? c.status === "Novo"
              : filter === "Clientes"
                ? c.status === "Cliente"
                : c.status === "Sumiu";
        return byFilter && c.name.toLowerCase().includes(q.toLowerCase());
      }),
    [filter, q],
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Contatos</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Quem está nos seus grupos — e quem precisa de um empurrão
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Total de contatos" value={String(CONTACTS.length)} />
        <MiniStat label="Novos · semana" value={String(counts.Novos)} tone="iris" />
        <MiniStat label="Clientes" value={String(counts.Clientes)} tone="sucesso" />
        <MiniStat label="Sumiram · recuperar" value={String(counts.Sumiram)} tone="alerta" />
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
            placeholder="Buscar contato…"
            className="w-full rounded-xl border border-breu/10 bg-white py-2.5 pl-9 pr-3 text-sm text-breu outline-none transition placeholder:text-aco/40 focus:border-iris/40 focus:ring-4 focus:ring-iris/10 sm:w-60"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-3xl border border-breu/[0.08] bg-white">
        <div className="hidden border-b border-breu/[0.06] bg-bruma/40 px-5 py-3 md:grid md:grid-cols-[1.6fr_1fr_0.7fr_0.7fr_auto] md:gap-4">
          {["Contato", "Grupo", "Status", "Gasto", ""].map((h) => (
            <span key={h} className="font-data text-[10px] uppercase tracking-wider text-aco/50">
              {h}
            </span>
          ))}
        </div>
        <div className="divide-y divide-breu/[0.06]">
          {rows.map((c) => (
            <div
              key={c.phone}
              className="grid grid-cols-1 gap-3 px-5 py-3.5 transition hover:bg-bruma/30 md:grid-cols-[1.6fr_1fr_0.7fr_0.7fr_auto] md:items-center md:gap-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-iris/10 font-data text-xs font-medium text-iris">
                  {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-breu">{c.name}</p>
                  <p className="font-data text-[11px] text-aco/55">{c.phone}</p>
                </div>
              </div>
              <p className="truncate text-sm text-aco">{c.group}</p>
              <div>
                <span className={cn("font-data inline-block rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider", STATUS[c.status])}>
                  {c.status}
                </span>
                <p className="font-data mt-1 text-[10px] text-aco/40">{c.last}</p>
              </div>
              <p className="font-data text-sm tabular-nums text-breu">{c.spent}</p>
              <div className="flex items-center gap-1 md:justify-end">
                {c.status === "Sumiu" ? (
                  <button className="inline-flex items-center gap-1.5 rounded-lg bg-iris/10 px-3 py-1.5 text-xs font-medium text-iris transition hover:bg-iris hover:text-white">
                    <RotateCcw className="h-3.5 w-3.5" /> Recuperar
                  </button>
                ) : (
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/40 transition hover:bg-bruma hover:text-iris">
                    <Send className="h-4 w-4" />
                  </button>
                )}
                <button className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/40 transition hover:bg-bruma hover:text-breu">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="px-5 py-16 text-center">
              <p className="font-display text-lg font-bold text-breu">Nenhum contato aqui</p>
              <p className="mt-1 text-sm text-aco/60">Ajuste o filtro ou a busca.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "iris" | "sucesso" | "alerta" }) {
  return (
    <div className="rounded-2xl border border-breu/[0.08] bg-white px-4 py-3.5">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p
        className={cn(
          "font-display mt-1 text-2xl font-extrabold tracking-tight",
          tone === "iris" ? "text-iris" : tone === "sucesso" ? "text-sucesso" : tone === "alerta" ? "text-alerta" : "text-breu",
        )}
      >
        {value}
      </p>
    </div>
  );
}
