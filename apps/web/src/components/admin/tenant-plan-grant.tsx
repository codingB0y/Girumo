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
 * Concede plano a um tenant: sem Stripe e sem prazo, ou — com "meses grátis"
 * preenchido — como cortesia na assinatura do Stripe, que volta a cobrar sozinha
 * no fim (`/api/admin/tenants/[id]/courtesy`).
 *
 * O aviso sobre o Stripe não é decoração: se o tenant tiver assinatura real
 * ativa, um evento futuro do webhook sobrescreve o status concedido aqui. Quem
 * clica precisa saber disso antes, não descobrir quando o acesso cair sozinho.
 */
export function TenantPlanGrant({ tenantId, plans, currentPlanId, currentStatus }: Props) {
  const router = useRouter();
  const [planId, setPlanId] = useState(currentPlanId ?? plans[0]?.id ?? "");
  const [reason, setReason] = useState("");
  // Vazio = concessão manual (sem prazo, sem Stripe). Preenchido = cortesia de N
  // meses na assinatura real, com a cobrança voltando sozinha no fim.
  const [months, setMonths] = useState("");
  const [loading, setLoading] = useState<"grant" | "revoke" | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const meses = Number(months);
  const comMeses = months.trim() !== "";
  const cortesia = comMeses && Number.isInteger(meses) && meses >= 1 && meses <= 36;
  // "0" ou "1.5" não podem cair em silêncio na concessão permanente.
  const mesesInvalidos = comMeses && !cortesia;

  async function chamar(action: "grant" | "revoke") {
    setLoading(action);
    setResult(null);
    try {
      const [url, body] =
        action === "revoke"
          ? [`/api/admin/tenants/${tenantId}/plan`, { action }]
          : cortesia
            ? [`/api/admin/tenants/${tenantId}/courtesy`, { planId, months: meses, reason }]
            : [`/api/admin/tenants/${tenantId}/plan`, { action, planId, reason }];
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        <p className="mt-0.5 text-xs text-aco/60" aria-live="polite">
          {mesesInvalidos
            ? "Meses grátis: use um número inteiro de 1 a 36."
            : cortesia
              ? `${meses} ${meses === 1 ? "mês grátis" : "meses grátis"} na assinatura do Stripe. No fim, a cobrança normal do plano volta sozinha no cartão do cliente — combine com ele antes. Plano diferente do atual muda de vez.`
              : "Sem meses: libera o plano sem cobrança e sem Stripe, até ser revogado. Com meses: cortesia no Stripe e a cobrança volta sozinha no fim."}
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

        <label className="sr-only" htmlFor="meses-cortesia">
          Meses grátis
        </label>
        <input
          id="meses-cortesia"
          type="number"
          inputMode="numeric"
          min={1}
          max={36}
          step={1}
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          disabled={loading !== null}
          placeholder="Meses grátis"
          className="w-[130px] rounded-xl border border-volt-950/10 bg-white px-3 py-2 text-sm text-volt-950 disabled:opacity-50"
        />

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
          disabled={loading !== null || !planId || mesesInvalidos}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
        >
          {loading === "grant" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Gift className="h-4 w-4" />
          )}
          {cortesia ? `Dar ${meses} ${meses === 1 ? "mês" : "meses"}` : "Conceder"}
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
