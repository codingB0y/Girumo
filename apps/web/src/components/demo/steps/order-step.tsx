import { DEMO_CAMPAIGN_NAME, DEMO_ORDER } from "@/lib/demo/fixtures";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Tela 4 do modo demonstração: o primeiro pedido.
 *
 * Estática — sem timer. Mostra `DEMO_ORDER` amarrado a `DEMO_CAMPAIGN_NAME`,
 * fechando o arco: campanha → disparo → grupo cheio → venda.
 */
export function OrderStep() {
  return (
    <div data-testid="demo-order-step" className="space-y-4 rounded-2xl border border-volt-950/10 bg-papel p-5">
      <div>
        <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">Pedido gerado pela campanha</p>
        <p className="text-sm text-aco" data-testid="demo-order-campaign">
          {DEMO_CAMPAIGN_NAME}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-dashed border-volt-950/10 pt-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-volt-950" data-testid="demo-order-buyer">
            {DEMO_ORDER.buyer}
          </p>
          <p className="font-data text-[11px] text-aco/55">{DEMO_ORDER.items} itens</p>
        </div>
        <p
          className="font-data shrink-0 text-2xl font-medium tabular-nums text-sucesso"
          data-testid="demo-order-total"
        >
          {currencyFormatter.format(DEMO_ORDER.total)}
        </p>
      </div>
    </div>
  );
}
