"use client";

import { Check } from "lucide-react";
import { brl } from "@/components/painel/home/format";
import { nomeDoCliente } from "@/lib/painel/vendas";
import { cn } from "@/lib/utils";
import type { VendaDoMes } from "@/lib/vendas/tipos";
import { ANEL_DE_FOCO } from "./itens-da-venda";

/**
 * Depois do registro (spec §4): o que foi gravado, onde corrigir e o caminho
 * para a próxima. A regra das 24h fica na própria linha de "Minhas vendas":
 * aqui ela estaria errada para dono, admin e operador. O anúncio para leitor de tela é o `role="status"` sempre
 * montado na página; este cartão é o que se vê. O foco vai para "Registrar
 * outra venda": o botão de envio sumiu, e sem isso o foco cairia no `body`.
 */
export function VendaRegistrada({ venda, aoNovaVenda }: { venda: VendaDoMes; aoNovaVenda: () => void }) {
  return (
    <section
      data-testid="venda-registrada"
      aria-labelledby="venda-registrada-titulo"
      className="flex flex-col gap-3 rounded-xl bg-paper-0 p-4 ring-1 ring-inset ring-success-700"
    >
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success-700 text-paper-0">
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p id="venda-registrada-titulo" className="text-15 font-semibold text-volt-950">
            Venda registrada
          </p>
          <p className="mt-0.5 truncate text-13 text-slate-600">
            {nomeDoCliente(venda)} · <span className="font-data">{brl.format(venda.total)}</span>
          </p>
        </div>
      </div>
      <p className="text-13 text-slate-600">Dá pra corrigir em Minhas vendas.</p>
      <button
        type="button"
        onClick={aoNovaVenda}
        autoFocus
        className={cn("h-11 rounded-[var(--radius-control)] bg-volt-950 text-[14px] font-semibold text-paper-0", ANEL_DE_FOCO)}
      >
        Registrar outra venda
      </button>
    </section>
  );
}
