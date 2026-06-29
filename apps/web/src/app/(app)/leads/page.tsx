"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Filter, RefreshCw, Send, ShoppingBag, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Topbar } from "@/components/topbar";
import { useToast } from "@/components/toast";
import { type Lead, type LeadStatus } from "@/lib/mock-data";
import { cn, formatDateTime, maskPhone } from "@/lib/utils";
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
  const [loaded, setLoaded] = useState(false);

  const scopeNames =
    active && groups.length
      ? new Set(groups.filter((group) => active.groupIds.includes(group.id)).map((group) => group.name))
      : null;

  async function load() {
    setSyncing(true);
    try {
      const data: Lead[] = await fetch("/api/leads").then((response) => response.json());
      if (Array.isArray(data) && data.length > 0) {
        setLeads(data);
        setLive(true);
      }
    } catch {
    } finally {
      setSyncing(false);
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    fetch("/api/groups")
      .then((response) => response.json())
      .then(setGroups)
      .catch(() => {});
    const timer = setInterval(load, 8_000);
    return () => clearInterval(timer);
  }, []);

  async function setStatus(id: string, status: LeadStatus) {
    setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, status } : lead)));
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

  async function registrarPedido(lead: Lead) {
    const raw = prompt(`Registrar pedido de ${lead.name}\nValor do pedido (R$):`, "");
    if (raw === null) return;
    const value = Number(raw.replace(",", "."));
    if (!value || value <= 0) {
      toast("Valor invalido", "error");
      return;
    }
    setLeads((prev) => prev.map((item) => (item.id === lead.id ? { ...item, status: "comprou" } : item)));
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, phone: lead.phone, group: lead.sourceGroup, value }),
      });
      if (!response.ok) throw new Error();
      toast(`Pedido de R$${value.toFixed(2)} registrado`);
    } catch {
      toast("Erro ao registrar pedido", "error");
      load();
    }
  }

  async function del(id: string) {
    if (!confirm("Excluir esta revendedora? Esta acao remove o numero definitivamente.")) return;
    setLeads((prev) => prev.filter((lead) => lead.id !== id));
    try {
      await fetch(`/api/leads?id=${id}`, { method: "DELETE" });
      toast("Revendedora removida");
    } catch {
      toast("Erro ao excluir", "error");
      load();
    }
  }

  const scoped = scopeNames ? leads.filter((lead) => scopeNames.has(lead.sourceGroup)) : leads;
  const filtered = filter === "todos" ? scoped : scoped.filter((lead) => lead.status === filter);
  const tabs: (LeadStatus | "todos")[] = ["todos", "novo", "ativo", "comprou"];

  return (
    <>
      <Topbar
        title="Revendedoras"
        subtitle={live ? "Leads capturados pelos grupos" : "Aguardando primeiras entradas"}
      />
      <main className="flex-1 bg-bruma/70 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5">
          <section className="grid gap-3 md:grid-cols-3">
            {(["novo", "ativo", "comprou"] as LeadStatus[]).map((status) => (
              <Card key={status} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-aco/70">{statusLabel[status]}</p>
                  <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
                </div>
                <p className="mt-2 text-2xl font-semibold text-breu">
                  {scoped.filter((lead) => lead.status === status).length}
                </p>
              </Card>
            ))}
          </section>

          <Card className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      filter === tab ? "bg-iris text-white shadow-brand" : "text-aco hover:bg-bruma"
                    }`}
                  >
                    {tab === "todos" ? "Todos" : statusLabel[tab]}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button size="sm" variant="outline" onClick={load} disabled={syncing}>
                  <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                  Atualizar
                </Button>
                <Link href="/campanhas">
                  <Button size="sm" variant="outline">
                    <Send className="h-4 w-4" />
                    Ver campanhas
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bruma bg-bruma text-left text-xs uppercase tracking-wide text-aco/70">
                    <th className="px-5 py-3 font-medium">Contato</th>
                    <th className="px-5 py-3 font-medium">Grupo</th>
                    <th className="px-5 py-3 font-medium">Origem</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Entrada</th>
                    <th className="px-5 py-3 font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bruma bg-white">
                  {!loaded &&
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={`sk-${index}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-8 w-8 rounded-lg" />
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
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-aco/50">
                        Nenhum lead encontrado neste filtro.
                      </td>
                    </tr>
                  )}
                  {filtered.map((lead) => (
                    <tr key={lead.id} className="hover:bg-bruma">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-iris/10 text-iris">
                            <UserPlus className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium text-breu">{lead.name}</p>
                            <p className="text-xs text-aco/50" title="Numero protegido">
                              {lead.phone ? maskPhone(lead.phone) : "Numero oculto"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-aco">{lead.sourceGroup}</td>
                      <td className="px-5 py-3 text-aco">{lead.sourceCampaign}</td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone[lead.status]}>{statusLabel[lead.status]}</Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-aco/50">{formatDateTime(lead.enteredAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => registrarPedido(lead)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15 transition hover:bg-emerald-100"
                            title="Registrar pedido"
                          >
                            <ShoppingBag className="h-3.5 w-3.5" />
                            Pedido
                          </button>
                          <select
                            value={lead.status}
                            onChange={(event) => setStatus(lead.id, event.target.value as LeadStatus)}
                            className="h-8 rounded-lg border border-breu/10 bg-white px-2 text-xs text-aco outline-none focus:border-iris-claro focus:ring-2 focus:ring-iris/15"
                            title="Mudar status"
                          >
                            <option value="novo">Novo</option>
                            <option value="ativo">Ativo</option>
                            <option value="comprou">Comprou</option>
                          </select>
                          <button
                            onClick={() => del(lead.id)}
                            className="rounded-lg p-1.5 text-aco/50 transition hover:bg-red-50 hover:text-red-600"
                            title="Excluir"
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

          <p className="flex items-center gap-1.5 text-xs text-aco/50">
            <Filter className="h-3.5 w-3.5" />
            Telefones aparecem mascarados por privacidade. A exclusao remove o contato da base local.
          </p>
        </div>
      </main>
    </>
  );
}
