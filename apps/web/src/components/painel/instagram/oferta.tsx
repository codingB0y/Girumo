"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useCasca } from "@/components/painel/casca-context";
import { IMPLANTACAO_CENTS, MENSAL_CENTS, formatarReais } from "@/lib/billing/instagram-preco";

const ESPERA_MS = 3_000;

/**
 * Loja sem o add-on. Logo depois de pagar (`?assinado=1`), o webhook do Stripe
 * pode levar alguns segundos para liberar: a tela pergunta de novo até ligar.
 */
export function OfertaInstagram() {
  const { recarregarInstagram } = useCasca();
  const assinado = useSearchParams().get("assinado") === "1";

  useEffect(() => {
    if (!assinado) return;
    const t = setInterval(recarregarInstagram, ESPERA_MS);
    return () => clearInterval(t);
  }, [assinado, recarregarInstagram]);

  return (
    <section className="px-5 py-6 lg:px-8">
      <h1 className="text-20 font-semibold text-volt-950">Instagram</h1>
      {assinado ? (
        <p role="status" className="mt-2 max-w-[52ch] text-13 text-volt-950">Pagamento recebido. Liberando o Instagram da loja…</p>
      ) : (
        <div className="mt-2 max-w-[52ch] space-y-3">
          <p className="text-13 text-slate-600">
            Quem comenta a palavra no post, manda no direct ou responde o story recebe no direct o link do grupo de WhatsApp da campanha.
          </p>
          <p className="text-13 text-volt-950">
            Implementação {formatarReais(IMPLANTACAO_CENTS)} + {formatarReais(MENSAL_CENTS)}/mês.
          </p>
          <Link href="/painel/instagram/assinar" className="inline-flex h-9 items-center rounded-[var(--radius-control)] bg-volt-950 px-3 text-13 font-medium text-canvas-100">
            Assinar o Instagram
          </Link>
        </div>
      )}
    </section>
  );
}
