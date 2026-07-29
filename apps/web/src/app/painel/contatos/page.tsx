"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, MessageCircle, ShoppingBag, X } from "lucide-react";
import { cn } from "@/lib/utils";

type LeadStatus = "novo" | "ativo" | "comprou";
type Lead = {
  id: string;
  name: string;
  phone: string;
  sourceGroup: string;
  sourceCampaign: string;
  status: LeadStatus;
  enteredAt: string;
};

const STATUS: Record<LeadStatus, { label: string; pill: string }> = {
  novo: { label: "Novo", pill: "bg-iris/[0.07] text-iris" },
  ativo: { label: "Ativo", pill: "bg-sucesso/10 text-sucesso" },
  comprou: { label: "Cliente", pill: "bg-sucesso/10 text-sucesso" },
};

const FILTERS: { value: "all" | LeadStatus; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "novo", label: "Novos" },
  { value: "ativo", label: "Ativos" },
  { value: "comprou", label: "Clientes" },
];

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!iso || Number.isNaN(ms)) return "";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

export default function PainelContatos() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | LeadStatus>("all");
  const [q, setQ] = useState("");
  const [orderLead, setOrderLead] = useState<Lead | null>(null);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((l) => setLeads(Array.isArray(l) ? l : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const rows = useMemo(
    () =>
      leads.filter(
        (l) =>
          (filter === "all" || l.status === filter) &&
          (l.name.toLowerCase().includes(q.toLowerCase()) || l.phone.includes(q)),
      ),
    [leads, filter, q],
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Contatos</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Quem entrou nos seus grupos pelas campanhas
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Total" value={String(leads.length)} />
        <MiniStat label="Novos" value={String(counts.novo ?? 0)} tone="iris" />
        <MiniStat label="Ativos" value={String(counts.ativo ?? 0)} tone="sucesso" />
        <MiniStat label="Clientes" value={String(counts.comprou ?? 0)} tone="sucesso" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-breu/10 bg-white p-1">
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
            placeholder="Buscar contato…"
            className="w-full rounded-xl border border-breu/10 bg-white py-2.5 pl-9 pr-3 text-sm text-breu outline-none transition placeholder:text-aco/40 focus:border-iris/40 focus:ring-4 focus:ring-iris/10 sm:w-64"
          />
        </div>
      </div>

      {loading ? (
        <div className="h-80 animate-pulse rounded-3xl border border-breu/[0.08] bg-white" />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-breu/[0.08] bg-white">
          <div className="hidden border-b border-breu/[0.06] bg-bruma/40 px-5 py-3 md:grid md:grid-cols-[1.6fr_1fr_0.8fr_auto] md:gap-4">
            {["Contato", "Origem", "Status", ""].map((h) => (
              <span key={h} className="font-data text-[10px] uppercase tracking-wider text-aco/50">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-breu/[0.06]">
            {rows.map((l) => {
              const initials = (l.name || l.phone || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
              const waPhone = l.phone.replace(/\D/g, "");
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-1 gap-3 px-5 py-3.5 transition hover:bg-bruma/30 md:grid-cols-[1.6fr_1fr_0.8fr_auto] md:items-center md:gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-iris/10 font-data text-xs font-medium text-iris">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-breu">{l.name || "Sem nome"}</p>
                      <p className="font-data text-[11px] text-aco/55">{l.phone || "número pendente"}</p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-aco">{l.sourceGroup || "—"}</p>
                    <p className="font-data text-[10px] text-aco/40">{ago(l.enteredAt)}</p>
                  </div>
                  <div>
                    <span className={cn("font-data inline-block rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider", STATUS[l.status]?.pill ?? "bg-bruma text-aco/60")}>
                      {STATUS[l.status]?.label ?? l.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 md:justify-self-end">
                    <button
                      onClick={() => setOrderLead(l)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cobalt-500/10 px-3 py-1.5 text-xs font-medium text-cobalt-500 transition-colors duration-[160ms] hover:bg-cobalt-500 hover:text-white"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" /> Registrar pedido
                    </button>
                    {waPhone ? (
                      <a
                        href={`https://wa.me/${waPhone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sucesso/10 px-3 py-1.5 text-xs font-medium text-sucesso transition hover:bg-sucesso hover:text-white"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> Conversar
                      </a>
                    ) : (
                      <span className="font-data text-[11px] text-aco/40">sem número</span>
                    )}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="px-5 py-16 text-center">
                <p className="font-display text-lg font-bold text-breu">
                  {leads.length === 0 ? "Nenhum contato ainda" : "Nenhum contato aqui"}
                </p>
                <p className="mt-1 text-sm text-aco/60">
                  {leads.length === 0 ? "Quando alguém entrar nos grupos pelas campanhas, aparece aqui." : "Ajuste o filtro ou a busca."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {orderLead && (
        <OrderModal
          lead={orderLead}
          onClose={() => setOrderLead(null)}
          onSaved={(leadId) =>
            setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: "comprou" } : l)))
          }
        />
      )}
    </div>
  );
}

function OrderModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead;
  onClose: () => void;
  onSaved: (leadId: string) => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value,
          leadId: lead.id,
          phone: lead.phone,
          group: lead.sourceGroup,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || "Não foi possível registrar o pedido.");
        return;
      }
      onSaved(lead.id);
      onClose();
    } catch {
      setError("Não foi possível registrar o pedido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-volt-950/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-volt-950/10 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-volt-950">Registrar pedido</h2>
            <p className="mt-1 text-sm text-aco/60">{lead.name || lead.phone || "Contato"}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1 text-aco/50 transition-colors hover:bg-poco hover:text-volt-950"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-5 block">
          <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">Valor do pedido (R$)</span>
          <input
            autoFocus
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="149,90"
            className="mt-1.5 w-full rounded-[10px] border border-volt-950/10 bg-poco px-3 py-2.5 text-sm text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] placeholder:text-aco/40 focus:border-cobalt-500/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)]"
          />
        </label>

        {error && <p className="mt-2 text-xs text-alerta">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-volt-950/10 py-2.5 text-sm font-medium text-aco transition hover:bg-canvas-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !value.trim()}
            className="flex-1 rounded-xl bg-cobalt-500 py-2.5 text-sm font-medium text-white shadow-brand transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "iris" | "sucesso" }) {
  return (
    <div className="rounded-2xl border border-breu/[0.08] bg-white px-4 py-3.5">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p className={cn("font-display mt-1 text-2xl font-extrabold tracking-tight", tone === "iris" ? "text-iris" : tone === "sucesso" ? "text-sucesso" : "text-breu")}>
        {value}
      </p>
    </div>
  );
}
