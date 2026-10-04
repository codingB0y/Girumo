"use client";

/**
 * A faixa do teste grátis no topo do conteúdo do painel (spec 2026-10-03, 4.7):
 * oferta para quem pode testar, contagem para quem está testando, e a saída para
 * quem teve o cartão recusado por já ter testado.
 *
 * Também abre o modal de oferta UMA vez por sessão. A marca vai para o
 * sessionStorage quando ele ABRE, não quando fecha: quem sai direto para o
 * Checkout e volta pelo "cancelar" do Stripe não toma o modal de novo — a faixa
 * continua oferecendo. Sem storage (aba privada), o layout persistente já impede
 * que ele reabra a cada navegação — só um reload o traria de volta.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { faixaDoTeste } from "@/lib/billing/trial-copy";

import { PlanPaywall } from "../plan-paywall";
import { TrialOffer } from "./trial-offer";
import { useTrial } from "./use-trial";

const CHAVE_OFERTA_VISTA = "girumo:oferta-teste-vista";

function jaViuNestaSessao(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_OFERTA_VISTA) === "1";
  } catch {
    return false;
  }
}

function marcarComoVista(): void {
  try {
    sessionStorage.setItem(CHAVE_OFERTA_VISTA, "1");
  } catch {
    // Sem storage: ver o comentário do componente.
  }
}

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

const BOTAO = `inline-flex min-h-10 shrink-0 items-center rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-sm font-semibold text-white transition-[filter] duration-[var(--duration-micro)] hover:brightness-110 ${FOCO}`;

export function TrialBanner() {
  const { view, ativando, voltouDoCheckout } = useTrial();
  const [ofertaAberta, setOfertaAberta] = useState(false);
  const [planosAbertos, setPlanosAbertos] = useState(false);

  useEffect(() => {
    // Quem acabou de voltar do Checkout não pode ver a oferta de novo enquanto o
    // webhook não grava — seria o convite a pagar duas vezes.
    if (!view?.elegivel || ativando || voltouDoCheckout || jaViuNestaSessao()) return;
    marcarComoVista();
    setOfertaAberta(true);
  }, [view?.elegivel, ativando, voltouDoCheckout]);

  if (ativando) {
    return (
      <p role="status" className="border-b border-volt-950/[0.08] bg-paper-0 px-4 py-2.5 text-sm text-volt-950 lg:px-7">
        Ativando seu teste grátis…
      </p>
    );
  }

  // Flag desligada ou leitura falhou → `view` nulo ou sem nada a mostrar → nenhuma
  // faixa e nenhum modal: o painel fica idêntico ao de antes do teste.
  const faixa = faixaDoTeste(view, new Date());
  if (!faixa) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Teste grátis"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-volt-950/[0.08] bg-paper-0 px-4 py-2.5 text-sm text-volt-950 lg:px-7"
      >
        <p className="min-w-0">{faixa.texto}</p>
        {faixa.tipo === "em_teste" ? (
          // `?secao=plano` é o deep-link que a própria página lê: sem ele, "Ver
          // plano" cairia na aba Conexão.
          <Link
            href="/painel/configuracoes?secao=plano"
            className={`inline-flex min-h-10 shrink-0 items-center rounded-[var(--radius-control)] font-semibold underline ${FOCO}`}
          >
            {faixa.acao}
          </Link>
        ) : (
          <button
            type="button"
            className={BOTAO}
            onClick={() => (faixa.tipo === "oferta" ? setOfertaAberta(true) : setPlanosAbertos(true))}
          >
            {faixa.acao}
          </button>
        )}
      </div>

      {ofertaAberta && <TrialOffer onClose={() => setOfertaAberta(false)} />}
      {planosAbertos && (
        <PlanPaywall motivo="Assine pra continuar usando o Girumo." onClose={() => setPlanosAbertos(false)} />
      )}
    </>
  );
}
