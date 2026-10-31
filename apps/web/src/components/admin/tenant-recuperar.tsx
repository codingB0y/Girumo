"use client";

import { Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AVISO_DE_PRIVACIDADE } from "@/lib/recuperar/aviso";

type Props = {
  tenantId: string;
  ligado: boolean;
  /** Quando o lojista confirmou o aviso de privacidade pela última vez, ou null se nunca. */
  avisoEm: string | null;
};

function data(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

/**
 * Liberação manual do Recuperar para a loja piloto: sem Stripe e sem cobrança. Só liga
 * depois de confirmar que o lojista viu o texto de privacidade. Desligar é recusado pelo
 * servidor quando há assinatura do Recuperar viva no Stripe.
 */
export function TenantRecuperar({ tenantId, ligado, avisoEm }: Props) {
  const router = useRouter();
  const [confirmado, setConfirmado] = useState(false);
  const [loading, setLoading] = useState<"ligar" | "desligar" | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function chamar(acao: "ligar" | "desligar") {
    setLoading(acao);
    setResult(null);
    try {
      const r = await fetch(`/api/admin/tenants/${tenantId}/recuperar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acao === "ligar" ? { acao, avisoConfirmado: confirmado } : { acao }),
      });
      const corpo = (await r.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!r.ok) {
        setResult({ type: "error", message: corpo?.error ?? "Não deu certo. Tente de novo." });
        return;
      }
      setConfirmado(false);
      setResult({ type: "success", message: corpo?.message ?? "Pronto." });
      router.refresh();
    } catch {
      setResult({ type: "error", message: "Sem conexão. Tente de novo." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-volt-950/[0.06] px-5 py-4">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-volt-950">
          <ShieldCheck className="h-4 w-4 text-cobalt-500" aria-hidden="true" />
          Recuperar (Yampi)
        </p>
        <p className="mt-0.5 text-xs font-medium text-volt-950">
          {ligado ? "Liberado." : "Desligado."}
          {avisoEm ? ` Aviso de privacidade confirmado em ${data(avisoEm)}.` : ""}
        </p>
        <p className="mt-0.5 text-xs text-aco/60">
          Liberar aqui não cobra e não passa pelo Stripe: serve para a loja piloto. Se a loja tiver assinatura do Recuperar no Stripe, desligar aqui é recusado.
        </p>
      </div>

      {ligado ? (
        <button
          type="button"
          onClick={() => void chamar("desligar")}
          disabled={loading !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          {loading === "desligar" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
          Desligar o Recuperar
        </button>
      ) : (
        <div className="space-y-2">
          <blockquote className="rounded-xl border-l-2 border-cobalt-500/40 bg-white px-3 py-2 text-xs text-volt-950">{AVISO_DE_PRIVACIDADE.texto}</blockquote>
          <label className="flex items-center gap-2 text-xs text-aco/70">
            <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} disabled={loading !== null} />
            O lojista confirmou o texto acima.
          </label>
          <button
            type="button"
            onClick={() => void chamar("ligar")}
            disabled={loading !== null || !confirmado}
            className="inline-flex items-center gap-2 rounded-xl border border-cobalt-500/30 bg-cobalt-500/[0.06] px-4 py-2 text-sm font-medium text-cobalt-500 transition hover:bg-cobalt-500/[0.1] disabled:opacity-50"
          >
            {loading === "ligar" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            Liberar o Recuperar
          </button>
        </div>
      )}

      {result && (
        <p role="status" className={`text-xs ${result.type === "success" ? "text-emerald-700" : "text-red-600"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
