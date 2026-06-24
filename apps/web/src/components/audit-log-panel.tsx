"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authenticatedFetch } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/components/toast";

type AuditLog = {
  id: string;
  actor_user_id: string | null;
  instance_id: string | null;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  message: string | null;
  created_at: string;
};

const toneByLevel: Record<AuditLog["level"], "slate" | "blue" | "amber" | "red"> = {
  debug: "slate",
  info: "blue",
  warn: "amber",
  error: "red",
};

export function AuditLogPanel() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/logs?limit=20");
      if (!res.ok) return;
      setLogs(await res.json());
    } catch {
      toast("Nao foi possivel carregar auditoria", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-brand-500" />
          Auditoria
        </CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={loadLogs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {loading ? (
            <div className="px-4 py-6 text-sm text-slate-400">Carregando auditoria...</div>
          ) : logs.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">Nenhum evento registrado.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{log.event}</p>
                  <p className="text-xs text-slate-400">{log.message ?? "Sem mensagem"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={toneByLevel[log.level]}>{log.level}</Badge>
                  <span className="text-xs text-slate-400">{formatDateTime(log.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
