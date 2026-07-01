"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Trash2, Loader2 } from "lucide-react";

type Props = {
  tenantId: string;
  tenantName: string;
  currentStatus: string;
};

export function TenantActions({ tenantId, tenantName, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleAction(action: "suspend" | "activate" | "delete") {
    setLoading(action);
    setResult(null);

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ type: "error", message: data.error ?? "Erro desconhecido" });
      } else {
        setResult({ type: "success", message: data.message });
        if (action === "delete") {
          setTimeout(() => router.push("/admin/tenants"), 1500);
        } else {
          router.refresh();
        }
      }
    } catch (err) {
      setResult({ type: "error", message: "Falha na requisição" });
    } finally {
      setLoading(null);
      setConfirmDelete(false);
    }
  }

  const isSuspended = currentStatus === "suspended";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {isSuspended ? (
          <button
            onClick={() => handleAction("activate")}
            disabled={loading !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            {loading === "activate" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Reativar tenant
          </button>
        ) : (
          <button
            onClick={() => handleAction("suspend")}
            disabled={loading !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
          >
            {loading === "suspend" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Ban className="h-4 w-4" />
            )}
            Suspender tenant
          </button>
        )}

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={loading !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5">
            <span className="text-sm text-red-700">Confirmar exclusão de &quot;{tenantName}&quot;?</span>
            <button
              onClick={() => handleAction("delete")}
              disabled={loading !== null}
              className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {loading === "delete" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Sim, excluir"
              )}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Feedback */}
      {result && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            result.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
