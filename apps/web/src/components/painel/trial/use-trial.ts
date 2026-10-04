"use client";

import { useEffect, useState } from "react";

import type { TrialView } from "@/lib/billing/trial";
import { authenticatedFetch } from "@/lib/supabase/client";

/** Voltando do Checkout, o webhook leva alguns segundos: relê até o teste aparecer. */
const TENTATIVAS_APOS_CHECKOUT = 10;
const INTERVALO_MS = 2000;

/**
 * O estado do teste grátis do tenant (`GET /api/billing/trial`).
 *
 * `view` nulo = carregando ou leitura falhou: as telas de teste simplesmente não
 * aparecem, e o gate de 402 continua funcionando sozinho. Resposta não-ok (500 de
 * tenant sem organização, 401) cai no mesmo caso — nenhuma oferta.
 *
 * `ativando` cobre a janela entre voltar do Stripe e o webhook gravar: sem ela a
 * faixa mostraria "Ativar 7 dias grátis" a quem acabou de ativar.
 */
export function useTrial(): { view: TrialView | null; ativando: boolean; voltouDoCheckout: boolean } {
  const [view, setView] = useState<TrialView | null>(null);
  const [ativando, setAtivando] = useState(false);
  const [voltouDoCheckout, setVoltouDoCheckout] = useState(false);

  useEffect(() => {
    let vivo = true;
    let tentativas = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const voltou = new URLSearchParams(window.location.search).get("billing") === "trial_started";
    setVoltouDoCheckout(voltou);
    setAtivando(voltou);

    async function ler() {
      try {
        const res = await authenticatedFetch("/api/billing/trial");
        if (!vivo) return;
        // Sem oferta, mas sem prender o "ativando" de quem voltou do Checkout.
        if (!res.ok) {
          setAtivando(false);
          return;
        }
        const dados = (await res.json()) as TrialView;
        if (!vivo) return;
        setView(dados);
        const resolvido = Boolean(dados.emTeste) || dados.cartaoRepetido;
        if (voltou && !resolvido && ++tentativas < TENTATIVAS_APOS_CHECKOUT) {
          timer = setTimeout(ler, INTERVALO_MS);
          return;
        }
        setAtivando(false);
      } catch {
        if (vivo) setAtivando(false);
      }
    }

    void ler();
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { view, ativando, voltouDoCheckout };
}
