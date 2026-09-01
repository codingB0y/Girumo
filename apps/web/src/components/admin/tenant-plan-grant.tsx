"use client";

import { Gift, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type PlanOption = {
  id: string;
  code: string;
  name: string;
  price_cents: number | null;
  active: boolean;
};

type Props = {
  tenantId: string;
  plans: PlanOption[];
  /** Plano da assinatura atual, se houver. */
  currentPlanId: string | null;
  /** `subscriptions.status` atual, ou null quando não existe assinatura. */
  currentStatus: string | null;
};

function precoLabel(cents: number | null) {
  if (!cents) return "grátis";
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês`;
}

/**
 * Concede plano a um tenant sem passar pelo Stripe.
 *
 * O aviso sobre o Stripe não é decoração: se o tenant tiver assinatura real
 * ativa, um evento futuro do webhook sobrescreve o status concedido aqui. Quem
 * clica precisa saber disso antes, não descobrir quando o acesso cair sozinho.
 */
export function TenantPlanGrant({ tenantId, plans, currentPlanId, currentStatus }: Props) {
  const router = useRouter();
  const [planId, setPlanId] = useState(currentPlanId ?? plans[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState<"grant" | "revoke" | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function chamar(action: "grant" | "revoke") {
    setLoading(action);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "grant" ? { action, planId, reason } : { action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ type: "error", message: data.error ?? "Erro desconhecido" });
      } else {
        setResult({ type: "success", message: data.message });
        router.refresh();
      }
    } catch {
      setResult({ type: "error", message: "Falha na requisição" });
    } finally {
      setLoading(null);
    }
  }

  const concede =
    currentStatus === "active" || currentStatus === "trialing" || currentStatus === "free";

  return (
    <div className="space-y-3 border-t border-volt-950/[0.06] px-5 py-4">
      <div>
        <p className="text-sm font-semibold text-volt-950">Conceder plano manualmente</p>
        <p className="mt-0.5 text-xs text-aco/60">
          Libera o plano sem cobrança e sem Stripe. Vale até ser revogado — não expira sozinho.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="plano-manual">
          Plano
        </label>
        <select
          id="plano-manual"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          disabled={loading !== null}
          className="rounded-xl border border-volt-950/10 bg-white px-3 py-2 text-sm text-volt-950 disabled:opacity-50"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {precoLabel(p.price_cents)}
              {p.active ? "" : " (fora do catálogo)"}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="motivo-manual">
          Motivo
        </label>
        <input
          id="motivo-manual"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={loading !== null}
          placeholder="Motivo (opcional)"
          className="min-w-[180px] flex-1 rounded-xl border border-volt-950/10 bg-white px-3 py-2 text-sm text-volt-950 disabled:opacity-50"
        />

        <button
          onClick={() => chamar("grant")}
          disabled={loading !== null || !planId}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
        >
          {loading === "grant" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Gift className="h-4 w-4" />
          )}
          Conceder
        </button>

        {concede && (
          <button
            onClick={() => chamar("revoke")}
            disabled={loading !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            {loading === "revoke" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Revogar acesso
          </button>
        )}
      </div>

      {plans.length === 0 && (
        <p className="text-xs text-red-600">Nenhum plano no catálogo — não há o que conceder.</p>
      )}

      {result && (
        <div
          role="status"
          className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
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
