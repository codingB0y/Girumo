"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";

type Instance = {
  id: string;
  name: string;
  phone: string | null;
  status: "pending" | "qr" | "connected" | "disconnected" | "blocked" | "error";
  qr_code: string | null;
  last_seen_at: string | null;
  created_at: string;
};

const statusTone: Record<Instance["status"], "green" | "amber" | "red" | "slate" | "blue"> = {
  pending: "slate",
  qr: "blue",
  connected: "green",
  disconnected: "amber",
  blocked: "red",
  error: "red",
};

export function InstancesPanel() {
  const toast = useToast();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [name, setName] = useState("WhatsApp principal");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const loadInstances = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/instances");
      if (!res.ok) return;
      setInstances(await res.json());
    } catch {
      toast("Nao foi possivel carregar instancias", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  async function createInstance(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await authenticatedFetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao criar instancia.");
      toast("Instancia criada");
      await loadInstances();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao criar instancia", "error");
    } finally {
      setCreating(false);
    }
  }

  async function refreshStatus(instanceId: string) {
    setRefreshingId(instanceId);
    try {
      const res = await authenticatedFetch("/api/engine/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, type: "refresh_status", payload: {} }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao pedir status.");
      toast("Atualizacao de status enviada para a engine");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao pedir status", "error");
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-iris" />
          Instancias WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="mb-4 flex flex-col gap-2 sm:flex-row" onSubmit={createInstance}>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da instancia" />
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar
          </Button>
        </form>

        <div className="divide-y divide-bruma rounded-lg border border-breu/10">
          {loading ? (
            <div className="px-4 py-6 text-sm text-aco/50">Carregando instancias...</div>
          ) : instances.length === 0 ? (
            <div className="px-4 py-6 text-sm text-aco/50">Nenhuma instancia criada.</div>
          ) : (
            instances.map((instance) => (
              <div key={instance.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-breu">{instance.name}</p>
                  <p className="text-xs text-aco/50">{instance.phone ?? "Telefone ainda nao sincronizado"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone[instance.status]}>{instance.status}</Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => refreshStatus(instance.id)}
                    disabled={refreshingId === instance.id}
                  >
                    {refreshingId === instance.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Status
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
