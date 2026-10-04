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
 *
 * O resultado da ativação vai para um `role="status"` sempre montado: a faixa nasce
 * depois da leitura, e uma região viva inserida já com texto não é anunciada.
 */

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

/** Foco fora do `body`: o cliente já está mexendo em algo, e o modal roubaria o foco. */
function clienteOcupado(): boolean {
  const foco = document.activeElement;
  return foco !== null && foco !== document.body;
}

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

const ALVO = "inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius-control)]";

// Hover escurece (cobalt-700, 7,5:1 com o branco) em vez de clarear: `brightness-110`
// derrubava o contraste do texto branco.
const BOTAO = `${ALVO} bg-cobalt-500 px-4 text-sm font-semibold text-white transition-colors duration-[var(--duration-micro)] hover:bg-cobalt-700 ${FOCO}`;

const FAIXA = "border-b border-volt-950/[0.08] bg-paper-0 px-4 py-2.5 text-sm text-volt-950 lg:px-7";

export function TrialBanner() {
  const { view, ativando, voltouDoCheckout } = useTrial();
  const [ofertaAberta, setOfertaAberta] = useState(false);
  const [planosAbertos, setPlanosAbertos] = useState(false);

  useEffect(() => {
    // Quem acabou de voltar do Checkout não pode ver a oferta de novo enquanto o
    // webhook não grava — seria o convite a pagar duas vezes.
    if (!view?.elegivel || ativando || voltouDoCheckout || jaViuNestaSessao()) return;
    // Sem marcar como vista: não foi vista, e a faixa continua oferecendo.
    if (clienteOcupado()) return;
    marcarComoVista();
    setOfertaAberta(true);
  }, [view?.elegivel, ativando, voltouDoCheckout]);

  // Flag desligada ou leitura falhou → `view` nulo ou sem nada a mostrar → nenhuma
  // faixa e nenhum modal: o painel fica idêntico ao de antes do teste.
  const faixa = ativando ? null : faixaDoTeste(view, new Date());
  // Só o desfecho de quem voltou do Checkout é anunciado; a oferta de sempre, não.
  const anuncio = ativando
    ? "Ativando seu teste grátis…"
    : voltouDoCheckout && faixa && faixa.tipo !== "oferta"
      ? faixa.texto
      : "";

  return (
    <>
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      {ativando ? (
        // O texto já sai pelo status acima; aqui é só o que se vê.
        <p aria-hidden="true" className={FAIXA}>
          Ativando seu teste grátis…
        </p>
      ) : (
        faixa && (
          <div
            role="region"
            aria-label="Teste grátis"
            className={`flex flex-wrap items-center justify-between gap-3 ${FAIXA}`}
          >
            <p className="min-w-0">{faixa.texto}</p>
            {faixa.tipo === "em_teste" ? (
              // `<a>` e não `Link`, como no paywall: um `Link` clicado de dentro de
              // Configurações não remontava a página, e "Ver plano" não fazia nada.
              <a href="/painel/configuracoes?secao=plano" className={`${ALVO} font-semibold underline ${FOCO}`}>
                {faixa.acao}
              </a>
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
        )
      )}

      {ofertaAberta && <TrialOffer onClose={() => setOfertaAberta(false)} />}
      {planosAbertos && (
        <PlanPaywall motivo="Assine pra continuar usando o Girumo." onClose={() => setPlanosAbertos(false)} />
      )}
    </>
  );
}
