"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Check, Store, Users, CheckCircle2, ChevronDown } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Group } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampanhas, type Campanha } from "@/lib/use-campanhas";
import { getActiveCampanhaId, setActiveCampanhaId } from "@/lib/active-campanha";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

export default function CampanhasPage() {
  const toast = useToast();
  const { campanhas, reload, loaded } = useCampanhas();
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [loja, setLoja] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setActiveId(getActiveCampanhaId());
    fetch("/api/groups").then((r) => r.json()).then(setGroups).catch(() => {});
  }, []);

  async function criar() {
    if (!name.trim()) return;
    await fetch("/api/campanhas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, loja: loja || "Minha loja" }),
    });
    setName("");
    setLoja("");
    setOpen(false);
    await reload();
    toast("Campanha criada — agora escolha os grupos");
  }

  async function toggleGrupo(c: Campanha, groupId: string) {
    const groupIds = c.groupIds.includes(groupId)
      ? c.groupIds.filter((x) => x !== groupId)
      : [...c.groupIds, groupId];
    await fetch("/api/campanhas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, groupIds }),
    });
    await reload();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta campanha? Os grupos não são apagados, só deixam de ser gerenciados aqui.")) return;
    await fetch(`/api/campanhas?id=${id}`, { method: "DELETE" });
    if (activeId === id) {
      setActiveCampanhaId(null);
      setActiveId(null);
    }
    await reload();
  }

  function ativar(id: string) {
    setActiveCampanhaId(id);
    setActiveId(id);
    toast("Campanha ativada — o app agora opera os grupos dela");
    setTimeout(() => location.reload(), 600);
  }

  // agrupa por loja
  const porLoja = campanhas.reduce<Record<string, Campanha[]>>((acc, c) => {
    (acc[c.loja] ??= []).push(c);
    return acc;
  }, {});

  return (
    <>
      <Topbar title="Campanhas" subtitle="Escolha os grupos de cada loja — a base de tudo no app" />
      <main className="flex-1 space-y-5 p-6">
        <div className="flex items-start justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
          <p className="text-sm text-slate-600">
            Uma <strong>campanha</strong> é o conjunto de grupos que você quer gerenciar. Crie por loja,
            escolha só os grupos certos e <strong>ative</strong> uma — o painel, os disparos e os
            resultados passam a operar só os grupos dela. Sem mistura com grupo aleatório.
          </p>
          <Button size="sm" onClick={() => setOpen((o) => !o)}>
            <Plus className="h-4 w-4" />
            Nova campanha
          </Button>
        </div>

        {open && (
          <Card>
            <CardHeader>
              <CardTitle>Nova campanha</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input placeholder="Nome da campanha (ex: Grupos VIP Inverno)" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
              <Input placeholder="Loja (ex: Virei Moda)" value={loja} onChange={(e) => setLoja(e.target.value)} />
              <Button className="sm:col-span-3" onClick={criar} disabled={!name.trim()}>
                Criar campanha
              </Button>
            </CardContent>
          </Card>
        )}

        {!loaded &&
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={`sk-${i}`} className="p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </Card>
          ))}
        {loaded && campanhas.length === 0 && (
          <Card className="p-8 text-center text-sm text-slate-400">
            Nenhuma campanha ainda. Crie a primeira e escolha os grupos da sua loja.
          </Card>
        )}

        {Object.entries(porLoja).map(([lojaNome, cs]) => (
          <div key={lojaNome} className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <Store className="h-4 w-4" /> {lojaNome}
            </p>
            {cs.map((c) => {
              const isActive = activeId === c.id;
              const isOpen = expanded === c.id;
              const members = groups.filter((g) => c.groupIds.includes(g.id)).reduce((s, g) => s + g.members, 0);
              return (
                <Card key={c.id} className={cn(isActive && "ring-2 ring-brand-500/30")}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-medium text-slate-900">
                          {c.name}
                          {isActive && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                              <CheckCircle2 className="h-3 w-3" /> ativa
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {c.groupIds.length} grupo(s) · {members.toLocaleString("pt-BR")} membros
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isActive && (
                          <Button size="sm" variant="outline" onClick={() => ativar(c.id)}>
                            Ativar
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setExpanded(isOpen ? null : c.id)}>
                          <Users className="h-3.5 w-3.5" />
                          Grupos
                          <ChevronDown className={cn("h-3.5 w-3.5 transition", isOpen && "rotate-180")} />
                        </Button>
                        <button onClick={() => excluir(c.id)} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
                        {groups.length === 0 && (
                          <p className="px-2 py-3 text-xs text-slate-400">Nenhum grupo sincronizado. Rode a engine.</p>
                        )}
                        {[...groups]
                          .sort((a, b) => b.members - a.members)
                          .map((g) => {
                            const on = c.groupIds.includes(g.id);
                            return (
                              <button
                                key={g.id}
                                onClick={() => toggleGrupo(c, g.id)}
                                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
                              >
                                <span className={cn("flex h-4 w-4 items-center justify-center rounded border-2", on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300")}>
                                  {on && <Check className="h-3 w-3" />}
                                </span>
                                <span className="flex-1 truncate text-sm text-slate-700">{g.name}</span>
                                <span className="text-xs text-slate-400">{g.members}</span>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))}
      </main>
    </>
  );
}
