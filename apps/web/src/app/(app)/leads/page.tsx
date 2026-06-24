"use client";

import { useEffect, useState } from "react";
import { UserPlus, Filter, Send, RefreshCw, Trash2, ShoppingBag } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type LeadStatus, type Lead } from "@/lib/mock-data";
import { formatDateTime, cn, maskPhone } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useCampanhas } from "@/lib/use-campanhas";

const statusLabel: Record<LeadStatus, string> = {
  novo: "Novo",
  ativo: "Ativo",
  comprou: "Comprou",
};

const statusTone = {
  novo: "blue",
  ativo: "amber",
  comprou: "green",
} as const;

export default function LeadsPage() {
  const toast = useToast();
  const { active } = useCampanhas();
  const [filter, setFilter] = useState<LeadStatus | "todos">("todos");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [live, setLive] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false); // 1º fetch concluído (mostra skeleton até lá)

  // Nomes dos grupos da campanha ativa — p/ escopar os leads.
  const scopeNames =
    active && groups.length
      ? new Set(groups.filter((g) => active.groupIds.includes(g.id)).map((g) => g.name))
      : null;

  async function setStatus(id: string, status: LeadStatus) {
    // Otimista: atualiza na hora e confirma no servidor.
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      toast("Erro ao atualizar status", "error");
      load();
    }
  }

  async function registrarPedido(l: Lead) {
    const raw = prompt(`Registrar pedido de ${l.name}\nValor do pedido (R$):`, "");
    if (raw === null) return;
    const value = Number(raw.replace(",", "."));
    if (!value || value <= 0) {
      toast("Valor inválido", "error");
      return;
    }
    // otimista: marca como comprou
    setLeads((prev) => prev.map((x) => (x.id === l.id ? { ...x, status: "comprou" } : x)));
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: l.id, phone: l.phone, group: l.sourceGroup, value }),
      });
      if (!res.ok) throw new Error();
      toast(`Pedido de R$${value.toFixed(2)} registrado 🛍️`);
    } catch {
      toast("Erro ao registrar pedido", "error");
      load();
    }
  }

  async function del(id: string) {
    if (!confirm("Excluir esta revendedora? (LGPD: remove o número definitivamente)")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    try {
      await fetch(`/api/leads?id=${id}`, { method: "DELETE" });
      toast("Revendedora removida");
    } catch {
      toast("Erro ao excluir", "error");
      load();
    }
  }

  // Lê leads reais capturados pela engine; cai no mock se ainda não houver nenhum.
  async function load() {
    setSyncing(true);
    try {
      const data: Lead[] = await fetch("/api/leads").then((r) => r.json());
      if (Array.isArray(data) && data.length > 0) {
        setLeads(data);
        setLive(true);
      }
    } catch {
      // mantém o que já tem
    } finally {
      setSyncing(false);
      setLoaded(true);
    }
  }

  // Busca ao abrir + auto-refresh a cada 8s (vê leads entrando sem F5).
  useEffect(() => {
    load();
    fetch("/api/groups").then((r) => r.json()).then(setGroups).catch(() => {});
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
  }, []);

  // Escopo da campanha ativa + filtro de status.
  const scoped = scopeNames ? leads.filter((l) => scopeNames.has(l.sourceGroup)) : leads;
  const filtered = filter === "todos" ? scoped : scoped.filter((l) => l.status === filter);
  const tabs: (LeadStatus | "todos")[] = ["todos", "novo", "ativo", "comprou"];

  return (
    <>
      <Topbar
        title="Revendedoras"
        subtitle={live ? "Quem já entrou nos seus grupos" : "Aguardando as primeiras entradas"}
      />
      <main className="flex-1 space-y-5 p-6">
        {/* Resumo */}
        <div className="grid grid-cols-3 gap-3">
          {(["novo", "ativo", "comprou"] as LeadStatus[]).map((s) => (
            <Card key={s} className="p-4">
              <p className="text-sm text-slate-500">{statusLabel[s]}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {scoped.filter((l) => l.status === s).length}
              </p>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  filter === t
                    ? "bg-brand-600 text-white shadow-brand"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t === "todos" ? "Todos" : statusLabel[t]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={syncing}>
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              Atualizar
            </Button>
            <a href="/campaigns">
              <Button size="sm" variant="outline">
                <Send className="h-4 w-4" />
                Mensagem em massa
              </Button>
            </a>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Contato</th>
                  <th className="px-5 py-3 font-medium">Grupo</th>
                  <th className="px-5 py-3 font-medium">Origem (campanha)</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Entrou</th>
                  <th className="px-5 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {!loaded &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-5 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-5 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                      <td className="px-5 py-3"><Skeleton className="h-3 w-20" /></td>
                      <td className="px-5 py-3"><Skeleton className="h-7 w-28" /></td>
                    </tr>
                  ))}
                {loaded && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">
                      Nenhum lead ainda. Conecte a engine e lote um grupo.
                    </td>
                  </tr>
                )}
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                          <UserPlus className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{l.name}</p>
                          <p className="text-xs text-slate-400" title="Número protegido (LGPD)">
                            {l.phone ? maskPhone(l.phone) : "Número oculto"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{l.sourceGroup}</td>
                    <td className="px-5 py-3 text-slate-600">{l.sourceCampaign}</td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone[l.status]}>{statusLabel[l.status]}</Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">{formatDateTime(l.enteredAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => registrarPedido(l)}
                          className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/15 transition hover:bg-green-100"
                          title="Registrar uma venda desta revendedora"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" />
                          Pedido
                        </button>
                        <select
                          value={l.status}
                          onChange={(e) => setStatus(l.id, e.target.value as LeadStatus)}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15"
                          title="Mudar status"
                        >
                          <option value="novo">Novo</option>
                          <option value="ativo">Ativo</option>
                          <option value="comprou">Comprou</option>
                        </select>
                        <button
                          onClick={() => del(l.id)}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          title="Excluir (LGPD)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <Filter className="h-3.5 w-3.5" />
          Cada número que entra no grupo vira um lead aqui dentro. O telefone fica protegido (LGPD) —
          só os 2 últimos dígitos aparecem. Nada sai pra CRM externo.
        </p>
      </main>
    </>
  );
}
