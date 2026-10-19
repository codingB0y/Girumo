// apps/web/src/components/painel/configuracoes/bling-painel-canais.tsx
"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de site-proprio-painel.tsx).
import React from "react";

import type { CanalDoCartao } from "@/lib/bling/cartao";
import { cn } from "@/lib/utils";
import { AJUDA, ANEL, BLOCO } from "./bling-painel-estilo";
import { legendaDoCanal, nomeDoCanal } from "./bling-painel-texto";

type Props = {
  canais: readonly CanalDoCartao[];
  /** Os marcados: canais cujos pedidos não mandam evento ao Meta. */
  fora: ReadonlySet<number>;
  travado: boolean;
  onAlternar: (id: number) => void;
};

/**
 * Os canais de venda do Bling (Yampi, Nuvemshop...) que já mandam a compra ao Meta pelo pixel deles. A venda segue
 * entrando na Girumo (Vendas, origem, listas); só o evento não sai daqui, para o Meta não contar a compra duas vezes.
 */
export function CanaisForaDoMeta({ canais, fora, travado, onAlternar }: Props) {
  return (
    // O fio do bloco fica no div: na borda do próprio fieldset a legenda sentaria em cima do fio.
    <div className={BLOCO}>
      <fieldset className="min-w-0">
        <legend className="text-15 font-semibold text-volt-950">Canais que já mandam a venda ao Meta</legend>
        <p className={AJUDA}>
          Marque o canal com pixel próprio (Yampi, Nuvemshop, Shopify...). A venda dele continua aqui, em Vendas e nas
          listas, mas o evento não sai da Girumo: assim o Meta não conta a mesma compra duas vezes.
        </p>
        {canais.length === 0 ? (
          <p className="mt-3 rounded-[var(--radius-control)] bg-canvas-100 p-3 text-13 text-volt-950">
            Nenhum pedido com canal de venda ainda. Cada canal aparece aqui quando chega um pedido novo dele (os
            importados antes desta opção não guardaram o canal). Pedido lançado direto no Bling não tem canal e sempre
            vai ao Meta.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-x-6">
            {canais.map((c) => (
              <li
                key={c.id}
                className="relative flex min-h-[58px] items-start gap-3 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 py-2"
              >
                <input
                  id={`bling-canal-${c.id}`}
                  type="checkbox"
                  checked={fora.has(c.id)}
                  disabled={travado}
                  onChange={() => onAlternar(c.id)}
                  aria-describedby={`bling-canal-${c.id}-legenda`}
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-volt-950 disabled:cursor-not-allowed",
                    ANEL,
                  )}
                />
                <span className="min-w-0">
                  {/* O `after` estica o rótulo sobre o cartão inteiro (como nas situações) sem pôr a legenda no nome. */}
                  <label
                    htmlFor={`bling-canal-${c.id}`}
                    className="font-data block cursor-pointer text-[14px] text-volt-950 after:absolute after:inset-0"
                  >
                    {nomeDoCanal(c)}
                  </label>
                  <span id={`bling-canal-${c.id}-legenda`} className="block text-13 text-slate-600">
                    {legendaDoCanal(c)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {canais.length > 0 && (
          <p className={AJUDA}>
            Não sabe qual é qual? Abra um desses pedidos no Bling: o campo Loja diz de que canal ele veio.
          </p>
        )}
      </fieldset>
    </div>
  );
}
