"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Shield, ArrowLeft } from "lucide-react";
import { PREVIEW_PATH } from "@/components/pages/editor/preview-protocol";

type ImpersonateData = {
  adminEmail: string;
  tenantName: string;
  startedAt: string;
};

export function ImpersonateBanner() {
  // Mesma razão do DevModeBanner: o root layout também alcança o iframe da prévia.
  const pathname = usePathname();
  const [data, setData] = useState<ImpersonateData | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    // Ler cookie dz_impersonate (httpOnly=true, então precisa ler via API)
    // Alternativa: ler do cookie acessível ao client
    // Como o cookie é httpOnly, vou criar um endpoint leve pra checar
    fetch("/api/admin/impersonate/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.impersonating) setData(d);
      })
      .catch(() => {});
  }, []);

  if (!data || pathname === PREVIEW_PATH) return null;

  async function handleEnd() {
    setEnding(true);
    try {
      const res = await fetch("/api/admin/impersonate", { method: "DELETE" });
      const result = await res.json();
      if (result.redirectTo) {
        window.location.href = result.redirectTo;
      }
    } catch {
      setEnding(false);
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 border-t border-amber-300 bg-amber-50 px-4 py-2.5 shadow-lg sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
          <Shield className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-amber-800">
            Impersonando: <span className="font-bold">{data.tenantName}</span>
          </p>
          <p className="font-data text-[11px] text-amber-600">
            Admin: {data.adminEmail} · Desde {new Date(data.startedAt).toLocaleTimeString("pt-BR")}
          </p>
        </div>
      </div>
      <button
        onClick={handleEnd}
        disabled={ending}
        className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao Admin
      </button>
    </div>
  );
}
