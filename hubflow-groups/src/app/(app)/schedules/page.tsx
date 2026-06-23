"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Repeat, Clock, Plus, Trash2 } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type Schedule, type Campaign } from "@/lib/mock-data";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/components/toast";

const recurrenceLabel = { none: "Única", daily: "Diária", weekly: "Semanal" } as const;
const statusTone = { pending: "blue", running: "amber", done: "green", failed: "red" } as const;
const statusLabel = {
  pending: "Agendada",
  running: "Executando",
  done: "Concluída",
  failed: "Falhou",
} as const;

export default function SchedulesPage() {
  const toast = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loaded, setLoaded] = useState(false); // 1º fetch (skeleton até lá)
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrence, setRecurrence] = useState<Schedule["recurrence"]>("none");

  async function load() {
    try {
      setSchedules(await fetch("/api/schedules").then((r) => r.json()));
    } catch {
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    load();
    fetch("/api/broadcasts").then((r) => r.json()).then(setCampaigns).catch(() => {});
  }, []);

  async function save() {
    const oferta = campaigns.find((c) => c.id === campaignId);
    if (!oferta || !scheduledAt) return;
    await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: oferta.id, campaignName: oferta.name, scheduledAt, recurrence }),
    });
    setCampaignId("");
    setScheduledAt("");
    setRecurrence("none");
    setOpen(false);
    await load();
    toast("Agendamento criado");
  }

  async function remove(id: string) {
    if (!confirm("Cancelar este agendamento?")) return;
    await fetch(`/api/schedules?id=${id}`, { method: "DELETE" });
    await load();
    toast("Agendamento cancelado");
  }

  return (
    <>
      <Topbar title="Divulgações agendadas" subtitle="Envios programados e recorrentes" />
      <main className="flex-1 space-y-4 p-6">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen((o) => !o)}>
            <Plus className="h-4 w-4" />
            Novo agendamento
          </Button>
        </div>

        {open && (
          <Card>
            <CardHeader>
              <CardTitle>Novo agendamento</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15 sm:col-span-2"
              >
                <option value="">Escolha uma oferta…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.groupIds.length} grupos)
                  </option>
                ))}
              </select>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as Schedule["recurrence"])}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15"
              >
                <option value="none">Única</option>
                <option value="daily">Diária</option>
                <option value="weekly">Semanal</option>
              </select>
              {campaigns.length === 0 && (
                <p className="text-xs text-amber-600 sm:col-span-4">
                  Você ainda não tem ofertas. Crie uma em <span className="font-medium">Ofertas</span> primeiro.
                </p>
              )}
              <Button className="sm:col-span-4" onClick={save} disabled={!campaignId || !scheduledAt}>
                Agendar
              </Button>
            </CardContent>
          </Card>
        )}

        {!loaded && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={`sk-${i}`} className="p-5">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
        {loaded && schedules.length === 0 && (
          <Card className="p-8 text-center text-sm text-slate-400">
            Nenhum agendamento. Crie o primeiro acima.
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {schedules.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{s.campaignName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDateTime(s.scheduledAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Repeat className="h-3.5 w-3.5" />
                        {recurrenceLabel[s.recurrence]}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge tone={statusTone[s.status]}>{statusLabel[s.status]}</Badge>
              </div>
              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => remove(s.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Cancelar
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <p className="text-xs text-slate-400">
          No horário, a engine dispara a oferta automaticamente pela fila anti-ban. Recorrentes
          reprogramam sozinhos para a próxima data. A engine precisa estar conectada.
        </p>
      </main>
    </>
  );
}
