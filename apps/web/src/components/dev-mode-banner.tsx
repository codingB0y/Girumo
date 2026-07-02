"use client";

import { useState, useEffect } from "react";
import { Bug, ChevronDown, X } from "lucide-react";

type TenantOption = {
  id: string;
  name: string;
  slug: string;
};

/**
 * DevModeBanner — barra fixa no topo que indica "LOCAL DEV MODE".
 * Só renderiza se NEXT_PUBLIC_APP_ENV=development.
 * Inclui switch tenant rápido.
 */
export function DevModeBanner() {
  const [visible, setVisible] = useState(true);
  const [showTenantSwitch, setShowTenantSwitch] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [activeTenant, setActiveTenant] = useState<string | null>(null);

  const appEnv = process.env.NEXT_PUBLIC_APP_ENV;
  const isDev = appEnv === "development";

  useEffect(() => {
    if (!isDev) return;
    // Ler tenant ativo do localStorage
    const stored = localStorage.getItem("hubflow_active_tenant_id");
    if (stored) setActiveTenant(stored);

    // Buscar tenants disponíveis
    fetch("/api/admin/tenants/list")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tenants) setTenants(data.tenants);
      })
      .catch(() => {});
  }, [isDev]);

  // Não renderizar fora de dev (depois dos hooks — rules-of-hooks)
  if (!isDev) return null;

  function switchTenant(tenantId: string) {
    localStorage.setItem("hubflow_active_tenant_id", tenantId);
    setActiveTenant(tenantId);
    setShowTenantSwitch(false);
    // Reload para aplicar novo tenant
    window.location.reload();
  }

  if (!visible) return null;

  const currentTenantName = tenants.find((t) => t.id === activeTenant)?.name || "Nenhum";

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 border-b border-green-500/30 bg-green-950/95 px-4 py-1.5 backdrop-blur-sm">
      {/* Left: Dev Mode label */}
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-green-500/20">
          <Bug className="h-3.5 w-3.5 text-green-400" />
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-green-400">
          🟢 Local Dev Mode
        </span>
        <span className="rounded bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-500">
          {process.env.NEXT_PUBLIC_APP_URL || "localhost:3000"}
        </span>
      </div>

      {/* Center: Tenant Switch */}
      <div className="relative">
        <button
          onClick={() => setShowTenantSwitch(!showTenantSwitch)}
          className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1 text-xs text-green-300 transition hover:bg-green-500/20"
        >
          <span className="text-green-500">Tenant:</span>
          <span className="font-medium text-green-200">{currentTenantName}</span>
          <ChevronDown className="h-3 w-3" />
        </button>

        {showTenantSwitch && tenants.length > 0 && (
          <div className="absolute top-full right-0 mt-1 w-64 rounded-lg border border-green-500/20 bg-green-950 p-1 shadow-xl">
            {tenants.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTenant(t.id)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition ${
                  t.id === activeTenant
                    ? "bg-green-500/20 text-green-200"
                    : "text-green-400 hover:bg-green-500/10"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${
                  t.id === activeTenant ? "bg-green-400" : "bg-green-700"
                }`} />
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-[10px] text-green-600">{t.slug}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Close */}
      <button
        onClick={() => setVisible(false)}
        className="rounded p-1 text-green-600 transition hover:bg-green-500/10 hover:text-green-400"
        aria-label="Fechar banner dev"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
