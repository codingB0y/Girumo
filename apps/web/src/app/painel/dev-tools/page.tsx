"use client";

import { useState } from "react";
import {
  Bug,
  Database,
  RefreshCw,
  Trash2,
  Zap,
  AlertTriangle,
  Users,
  Activity,
  Webhook,
  Ban,
  Server,
  RotateCcw,
} from "lucide-react";

type LogEntry = {
  timestamp: string;
  action: string;
  result: "success" | "error" | "info";
  details?: string;
};

export default function DevToolsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const appEnv = process.env.NEXT_PUBLIC_APP_ENV;

  // Bloqueio visual se não for dev
  if (appEnv !== "development") {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-16 w-16 text-red-400" />
        <h1 className="text-2xl font-bold text-red-400">Bloqueado</h1>
        <p className="text-cinza-600">Dev Tools só funciona em ambiente development.</p>
        <p className="text-xs text-cinza-500">NEXT_PUBLIC_APP_ENV = {appEnv}</p>
      </div>
    );
  }

  function addLog(action: string, result: "success" | "error" | "info", details?: string) {
    setLogs((prev) => [
      { timestamp: new Date().toISOString(), action, result, details },
      ...prev,
    ].slice(0, 50));
  }

  async function runAction(id: string, label: string, url: string, method = "POST") {
    setLoading(id);
    try {
      const res = await fetch(url, { method });
      const data = await res.json();
      if (res.ok) {
        addLog(label, "success", JSON.stringify(data).slice(0, 200));
      } else {
        addLog(label, "error", data.error || JSON.stringify(data));
      }
    } catch (err) {
      addLog(label, "error", String(err));
    } finally {
      setLoading(null);
    }
  }

  const actions = [
    {
      id: "seed-dev",
      label: "Popular Banco (Dev Seed)",
      description: "Cria admin, tenants, users e dados fake",
      icon: Database,
      url: "/api/admin/seed/dev",
      color: "text-green-400",
      bgColor: "bg-green-500/10 hover:bg-green-500/20",
    },
    {
      id: "seed-full",
      label: "Seed Completo (8 tenants)",
      description: "Popula com dados fake realistas completos",
      icon: Users,
      url: "/api/admin/seed",
      color: "text-blue-400",
      bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
    },
    {
      id: "reset-db",
      label: "Reset Dados",
      description: "Limpa todas as tabelas do banco DEV",
      icon: Trash2,
      url: "/api/admin/dev-tools/reset",
      color: "text-red-400",
      bgColor: "bg-red-500/10 hover:bg-red-500/20",
    },
    {
      id: "simulate-webhook",
      label: "Simular Webhook Stripe",
      description: "Envia webhook fake de pagamento",
      icon: Webhook,
      url: "/api/admin/dev-tools/simulate-webhook",
      color: "text-purple-400",
      bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
    },
    {
      id: "simulate-ban",
      label: "Simular Ban WhatsApp",
      description: "Simula desconexão por ban na engine",
      icon: Ban,
      url: "/api/admin/dev-tools/simulate-ban",
      color: "text-orange-400",
      bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
    },
    {
      id: "simulate-failure",
      label: "Simular Falha na Engine",
      description: "Testa comportamento quando engine cai",
      icon: AlertTriangle,
      url: "/api/admin/dev-tools/simulate-failure",
      color: "text-yellow-400",
      bgColor: "bg-yellow-500/10 hover:bg-yellow-500/20",
    },
    {
      id: "clear-sessions",
      label: "Limpar Sessões",
      description: "Remove todas as sessões dev da engine",
      icon: RotateCcw,
      url: "/api/admin/dev-tools/clear-sessions",
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10 hover:bg-cyan-500/20",
    },
    {
      id: "engine-health",
      label: "Engine Health Check",
      description: "Verifica se a engine mock está online",
      icon: Server,
      url: "/api/admin/dev-tools/engine-health",
      method: "GET",
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
          <Bug className="h-5 w-5 text-green-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Developer Tools</h1>
          <p className="text-sm text-cinza-500">
            Ferramentas de desenvolvimento — ambiente isolado
          </p>
        </div>
        <div className="ml-auto rounded-lg bg-green-500/10 px-3 py-1.5">
          <span className="text-xs font-bold uppercase text-green-400">🟢 DEV MODE</span>
        </div>
      </div>

      {/* Actions Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          const isLoading = loading === action.id;
          return (
            <button
              key={action.id}
              onClick={() => runAction(action.id, action.label, action.url, (action as { method?: string }).method || "POST")}
              disabled={isLoading}
              className={`flex flex-col items-start gap-2 rounded-xl border border-white/5 p-4 text-left transition ${action.bgColor} disabled:opacity-50`}
            >
              <div className="flex w-full items-center justify-between">
                <Icon className={`h-5 w-5 ${action.color}`} />
                {isLoading && <RefreshCw className="h-4 w-4 animate-spin text-cinza-400" />}
              </div>
              <p className="text-sm font-medium">{action.label}</p>
              <p className="text-xs text-cinza-500">{action.description}</p>
            </button>
          );
        })}
      </div>

      {/* Quick Info */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-xs text-cinza-500">Ambiente</p>
          <p className="text-sm font-medium text-green-400">{appEnv}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-xs text-cinza-500">Engine Mode</p>
          <p className="text-sm font-medium text-cyan-400">{process.env.NEXT_PUBLIC_ENGINE_MODE || "mock"}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-xs text-cinza-500">Supabase</p>
          <p className="text-sm font-medium text-purple-400 truncate">
            {process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "").split(".")[0] || "não configurado"}
          </p>
        </div>
      </div>

      {/* Logs */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cinza-400" />
            <h2 className="text-sm font-medium">Execution Log</h2>
          </div>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-xs text-cinza-500 hover:text-cinza-300"
            >
              Limpar
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <p className="py-8 text-center text-xs text-cinza-600">
            Execute uma ação acima para ver os logs aqui
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
            {logs.map((log, i) => (
              <div
                key={i}
                className={`flex gap-2 rounded px-2 py-1 ${
                  log.result === "success"
                    ? "bg-green-500/5 text-green-400"
                    : log.result === "error"
                      ? "bg-red-500/5 text-red-400"
                      : "bg-blue-500/5 text-blue-400"
                }`}
              >
                <span className="shrink-0 text-cinza-600">
                  {new Date(log.timestamp).toLocaleTimeString("pt-BR")}
                </span>
                <span className="shrink-0">
                  {log.result === "success" ? "✓" : log.result === "error" ? "✗" : "ℹ"}
                </span>
                <span className="font-medium">{log.action}</span>
                {log.details && (
                  <span className="truncate text-cinza-500">— {log.details}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Credentials Reference */}
      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
        <h3 className="mb-2 text-sm font-medium text-yellow-400">🔑 Credenciais DEV</h3>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <p className="text-cinza-500">Super Admin:</p>
            <p className="font-mono text-yellow-300">admin@localhost.dev / DevOnly123!</p>
          </div>
          <div>
            <p className="text-cinza-500">Operador:</p>
            <p className="font-mono text-yellow-300">operador@dev.local / DevUser123!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
