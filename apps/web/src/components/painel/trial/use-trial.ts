"use client";

import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { TrialView } from "@/lib/billing/trial";
import { authenticatedFetch } from "@/lib/supabase/client";

/** Voltando do Checkout, o webhook leva alguns segundos: relê até 10 vezes, de 2 em 2 s. */
const TENTATIVAS_APOS_CHECKOUT = 10;
const INTERVALO_MS = 2000;
/** `success_url` do checkout com teste (`checkout-session.ts`). */
const VOLTOU_DO_CHECKOUT = "trial_started";

export type EstadoDoTeste = {
  view: TrialView | null;
  ativando: boolean;
  voltouDoCheckout: boolean;
  /** A primeira leitura terminou, com ou sem oferta: separa "carregando" de "nada a oferecer". */
  carregado: boolean;
};

/**
 * Depois de voltar do Checkout, o que fazer com a leitura número `tentativa` (1, 2, …).
 *
 * O webhook grava `trialing` ANTES de descobrir que o cartão já foi usado e cancelar.
 * Parar no primeiro `trialing` deixava a faixa anunciando a cobrança de um teste já
 * cancelado até o reload. Então o primeiro `emTeste` só tira o "Ativando…" (o caminho
 * feliz não fica mais lento) e a releitura segue no mesmo orçamento: quem encerra
 * antes é o cartão repetido, que é final.
 */
export function aposLeitura(view: TrialView, tentativa: number): { ativando: boolean; continuar: boolean } {
  if (view.cartaoRepetido) return { ativando: false, continuar: false };
  const cabe = cabeOutraLeitura(tentativa);
  return { ativando: !view.emTeste && cabe, continuar: cabe };
}

/**
 * Leitura que falhou (resposta não-ok ou exceção): relê de novo? Voltando do Checkout,
 * sim, enquanto couber no orçamento — a falha gasta uma tentativa. Um 500 entre o
 * `trialing` e o cancelamento do cartão repetido encerrava a releitura ali, e a faixa
 * voltava a anunciar a cobrança de um teste já cancelado. Fora da volta, uma leitura
 * só, como sempre.
 */
export function releAposErro(voltou: boolean, tentativa: number): boolean {
  return voltou && cabeOutraLeitura(tentativa);
}

function cabeOutraLeitura(tentativa: number): boolean {
  return tentativa < TENTATIVAS_APOS_CHECKOUT;
}

function lerVoltaDoCheckout(): boolean {
  return new URLSearchParams(window.location.search).get("billing") === VOLTOU_DO_CHECKOUT;
}

/**
 * Tira `?billing=trial_started` da barra de endereço, mantendo o resto da busca e o
 * hash: um F5 ou um link copiado não reabre o "Ativando…".
 */
function limparVoltaDaUrl(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get("billing") !== VOLTOU_DO_CHECKOUT) return;
  url.searchParams.delete("billing");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * A leitura de `GET /api/billing/trial`. `ligado` falso = outra instância já lê
 * (o `TrialProvider`), e esta não faz nada: hook não pode ser condicional.
 *
 * `view` nulo = carregando ou leitura falhou: as telas de teste simplesmente não
 * aparecem, e o gate de 402 continua funcionando sozinho. Resposta não-ok (500 de
 * tenant sem organização, 401) cai no mesmo caso — nenhuma oferta.
 *
 * `ativando` cobre a janela entre voltar do Stripe e o webhook gravar: sem ela a
 * faixa mostraria "Ativar 7 dias grátis" a quem acabou de ativar.
 */
function useLeituraDoTeste(ligado: boolean): EstadoDoTeste {
  const [view, setView] = useState<TrialView | null>(null);
  const [ativando, setAtivando] = useState(false);
  const [voltouDoCheckout, setVoltouDoCheckout] = useState(false);
  const [carregado, setCarregado] = useState(false);
  // Lido uma vez só: a URL é limpa logo depois, e o StrictMode do dev roda o efeito
  // duas vezes — a segunda veria a URL já limpa.
  const voltouRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!ligado) return;
    if (voltouRef.current === null) voltouRef.current = lerVoltaDoCheckout();
    const voltou = voltouRef.current;
    let vivo = true;
    let tentativa = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Depois do commit, não aqui: o Router do Next só passa a acompanhar o
    // `history.replaceState` num efeito dele, que roda depois dos efeitos dos filhos.
    // Antes disso a troca apagaria o estado interno do Router, e o "voltar" do
    // navegador para esta entrada deixaria de funcionar.
    const limpeza = voltou ? setTimeout(limparVoltaDaUrl, 0) : undefined;
    setVoltouDoCheckout(voltou);
    setAtivando(voltou);

    // Leitura sem resposta útil: a `view` e o "Ativando…" ficam como estão e, se
    // `releAposErro` deixar, relê; senão encerra sem prender o "Ativando…" de quem voltou.
    function falhou() {
      setCarregado(true);
      if (releAposErro(voltou, tentativa)) {
        timer = setTimeout(ler, INTERVALO_MS);
        return;
      }
      setAtivando(false);
    }

    async function ler() {
      tentativa += 1;
      try {
        const res = await authenticatedFetch("/api/billing/trial");
        if (!vivo) return;
        if (!res.ok) return falhou();
        const dados = (await res.json()) as TrialView;
        if (!vivo) return;
        setView(dados);
        setCarregado(true);
        if (!voltou) return;
        const passo = aposLeitura(dados, tentativa);
        setAtivando(passo.ativando);
        if (passo.continuar) timer = setTimeout(ler, INTERVALO_MS);
      } catch {
        if (vivo) falhou();
      }
    }

    void ler();
    return () => {
      vivo = false;
      clearTimeout(timer);
      clearTimeout(limpeza);
    };
  }, [ligado]);

  return { view, ativando, voltouDoCheckout, carregado };
}

const TrialContext = createContext<EstadoDoTeste | null>(null);

/**
 * Uma leitura só para o painel inteiro (montado no layout). Cada componente lendo
 * sozinho discordava: o paywall aberto em outra rota durante o "Ativando…" não via a
 * volta do Checkout e oferecia o teste de novo.
 */
export function TrialProvider({ children }: { children: ReactNode }) {
  const estado = useLeituraDoTeste(true);
  return createElement(TrialContext.Provider, { value: estado }, children);
}

/**
 * O estado do teste grátis do tenant. Dentro do painel, o do `TrialProvider`; fora
 * dele (o `PlanPaywall` também abre fora do layout), uma leitura própria.
 */
export function useTrial(): EstadoDoTeste {
  const doPainel = useContext(TrialContext);
  const proprio = useLeituraDoTeste(doPainel === null);
  return doPainel ?? proprio;
}
