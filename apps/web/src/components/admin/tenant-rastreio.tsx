"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Liberação do Rastreio de pedidos por loja. `enabled === null`: a leitura falhou. */
export function TenantRastreio({ tenantId, enabled }: { tenantId: string; enabled: boolean | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function alternar() {
    if (enabled === null) return;
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch(`/api/admin/tenants/${tenantId}/rastreio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const corpo = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        setErro(corpo?.error ?? "Não deu certo. Tente de novo.");
        return;
      }
      router.refresh();
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="pn-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-15 font-semibold">Rastreio de pedidos</h2>
          <p className="mt-1 text-13 text-neutral-600">
            Libera Configurações › Rastreio de pedidos, Vendas › Entregas e os avisos de pedido pelo número do atendimento. Sem cobrança na v1: os avisos saem só para loja com plano ativo.
          </p>
          {enabled === null && <p className="mt-2 text-13 text-danger-700">Não deu para ler o estado.</p>}
          {erro && (
            <p role="alert" className="mt-2 text-13 text-danger-700">
              {erro}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled === true}
          aria-label="Rastreio de pedidos liberado"
          disabled={enabled === null || loading}
          onClick={alternar}
          className="pn-interruptor shrink-0"
        >
          <span className="pn-interruptor__bolinha" />
        </button>
      </div>
    </section>
  );
}
