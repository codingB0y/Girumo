"use client";

/**
 * Os planos no próprio ponto de bloqueio.
 *
 * O PR #158 fez o gate mostrar a mensagem certa e um botão "Ver planos" que
 * levava a `/painel/configuracoes`. Funcionava, mas cobrava do cliente dois
 * cliques e a perda do contexto — ele estava escrevendo uma campanha, e para
 * pagar tinha de sair da tela e procurar o plano.
 *
 * Desde 03/10/2026 este é também a porta do teste grátis: quando a conta é
 * elegível, o mesmo diálogo vira "Teste 7 dias grátis pra continuar" — o servidor
 * aplica o teste no checkout. O rodapé dos 7 dias de arrependimento saiu: o direito
 * fica escrito só nos Termos (spec, seção 2).
 *
 * Abre sobre a tela e vai direto ao checkout do Stripe.
 */

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React, { useCallback, useEffect, useState } from "react";

import { useTrial } from "@/components/painel/trial/use-trial";
import { useFocusTrap } from "@/components/painel/use-focus-trap";
import { abrirCheckout } from "@/lib/billing/checkout-client";
import {
  formatarPreco,
  planosParaOferecer,
  type PlanoCatalogo,
} from "@/lib/billing/plan-display";
import type { TrialView } from "@/lib/billing/trial";
import { linhaDoPrecoNoTeste } from "@/lib/billing/trial-copy";

export type ModoDoPaywall = "normal" | "teste" | "em_teste";

/**
 * Qual paywall mostrar.
 *
 * - `em_teste`: o checkout recusa (409) quem já está testando — cancelado ou não —,
 *   então N botões "Assinar" seriam N becos sem saída. Vem antes de `elegivel` para
 *   o teste em andamento nunca ver o rodapé que anuncia a cobrança.
 * - `teste`: elegível, e não acabou de voltar do Checkout. Durante `ativando` o
 *   webhook ainda não gravou o teste; oferecer "Testar grátis" de novo seria o
 *   convite a ativar duas vezes.
 * - `normal`: flag desligada ou leitura falhou (`view` nulo) → o paywall de antes do teste.
 */
export function modoDoPaywall(view: TrialView | null, ativando: boolean): ModoDoPaywall {
  if (view?.emTeste) return "em_teste";
  if (view?.elegivel === true && !ativando) return "teste";
  return "normal";
}

interface PlanPaywallProps {
  /** A mensagem do 402, para o cliente saber o que o trouxe até aqui. */
  motivo: string;
  onClose: () => void;
}

/** Qual controle disparou o checkout: só ele mostra "Abrindo…". */
type Assinando = { planCode: string; semTeste: boolean } | null;

export function PlanPaywall({ motivo, onClose }: PlanPaywallProps) {
  const [planos, setPlanos] = useState<PlanoCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [assinando, setAssinando] = useState<Assinando>(null);
  // O foco entra no primeiro tabulável (o Fechar), fica preso no diálogo e volta
  // ao "Ver planos" que o abriu: aria-modal só promete isso, quem cumpre é a trava.
  const dialogoRef = useFocusTrap<HTMLDivElement>(true);
  const { view, ativando } = useTrial();
  const modo = modoDoPaywall(view, ativando);
  const comTeste = modo === "teste";

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPlanos(planosParaOferecer(Array.isArray(d) ? d : [])))
      .catch(() => setPlanos([]))
      .finally(() => setCarregando(false));
  }, []);

  // A caminho do Stripe, fechar não cancela nada: a navegação já foi pedida e o
  // cliente cairia no Checkout depois de fechar. Por isso Esc, fundo e × ficam
  // mudos enquanto `assinando` (mesma regra do TrialOffer).
  const fechar = assinando ? undefined : onClose;

  // Só o Esc depende de `fechar`. O foco fica fora deste efeito: o PlanLimitAlert
  // passa uma arrow nova a cada render, e refocar aqui jogaria o foco de volta no
  // Fechar a cada re-render da tela de trás.
  useEffect(() => {
    if (!fechar) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [fechar]);

  const assinar = useCallback(async (planCode: string, semTeste = false) => {
    setAssinando({ planCode, semTeste });
    setErro(null);
    try {
      await abrirCheckout(planCode, { semTeste });
    } catch (e) {
      // Mesma razão do painel de configurações: engolir aqui deixaria o botão
      // girar, parar, e a tela idêntica a antes do clique — inclusive para o
      // suporte, porque o cliente só sabe dizer "não acontece". Inclui o 409 de
      // quem está em teste e clicou antes de `view` chegar.
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o checkout.");
      setAssinando(null);
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-volt-950/70 p-4"
      onClick={fechar}
    >
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-titulo"
        aria-describedby="paywall-motivo"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-paper-0 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="paywall-titulo" className="text-lg font-semibold text-volt-950">
              {comTeste ? "Teste 7 dias grátis pra continuar" : "Escolha um plano pra continuar"}
            </h2>
            <p id="paywall-motivo" className="mt-1 text-sm text-volt-950/70">
              {motivo}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={assinando !== null}
            aria-label="Fechar"
            className="shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-xl leading-none text-volt-950/50 transition-colors hover:text-volt-950 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
          >
            ×
          </button>
        </div>

        {erro && (
          <p role="alert" className="mt-4 rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta">
            {erro}
          </p>
        )}

        {modo === "em_teste" ? (
          // Um caminho só: no teste, a troca de plano vai pelo portal. `<a>` e não
          // `Link`: a página lê `?secao=` só ao montar, e um 402 aberto dentro da
          // própria Configurações não a remontaria.
          <div className="mt-5 space-y-3">
            <p className="text-sm text-volt-950/70">
              Durante o teste grátis, a troca de plano é feita em Gerenciar cobrança.
            </p>
            <a
              href="/painel/configuracoes?secao=plano"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-cobalt-500 px-4 py-2 text-sm font-semibold text-white transition-[filter] duration-[var(--duration-micro)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
            >
              Trocar de plano em Configurações › Plano
            </a>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {carregando && <p className="text-sm text-volt-950/60">Carregando planos…</p>}

            {!carregando && planos.length === 0 && (
              // Lista vazia não pode virar diálogo vazio: o cliente ficaria
              // olhando para um modal sem nada e sem saber o que fazer.
              //
              // O texto não afirma a causa de propósito. São duas, e a tela não
              // sabe distinguir: o catálogo pode ter falhado, ou pode ter vindo
              // inteiro sem nenhum plano vendável — é o caso do banco de dev,
              // onde nenhum plano tem stripe_price_id. Dizer "não foi possível
              // carregar" no segundo caso seria mentira.
              <p className="text-sm text-volt-950/70">
                Não consegui listar os planos aqui. Abra{" "}
                <a className="font-medium underline" href="/painel/configuracoes">
                  Configurações
                </a>{" "}
                pra escolher.
              </p>
            )}

            {planos.map((plano) => {
              const abrindoEste = assinando?.planCode === plano.code && !assinando.semTeste;
              const acao = comTeste ? "Testar grátis" : "Assinar";
              return (
                <div
                  key={plano.code}
                  className="flex items-center justify-between gap-4 rounded-xl border border-volt-950/[0.08] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-volt-950">{plano.name}</p>
                    <p className="text-sm text-volt-950/60">
                      {comTeste ? (
                        linhaDoPrecoNoTeste(plano.price_cents ?? 0)
                      ) : (
                        <>
                          {formatarPreco(plano.price_cents ?? 0)}
                          <span className="text-volt-950/40"> /mês</span>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void assinar(plano.code)}
                    disabled={assinando !== null}
                    // Três botões "Assinar" iguais não dizem a quem usa leitor de tela
                    // qual plano cada um assina.
                    aria-label={
                      abrindoEste
                        ? `Abrindo o checkout do plano ${plano.name}`
                        : `${acao} o plano ${plano.name}`
                    }
                    className="min-h-11 shrink-0 rounded-[var(--radius-control)] bg-cobalt-500 px-4 py-2 text-sm font-semibold text-white transition-[filter] duration-[var(--duration-micro)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:opacity-50"
                  >
                    {abrindoEste ? "Abrindo…" : acao}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {comTeste ? (
          <div className="mt-5 space-y-2 text-center text-xs text-volt-950/60">
            <p>A cobrança começa no 8º dia, no cartão que você cadastrar. Cancele antes e não paga nada.</p>
            {/* ponytail: boleto abre o 1º plano (o de entrada); boleto em outro plano
                vai pelo modal de oferta (TrialOffer), que tem a escolha do plano.
                Seletor aqui só se o suporte pedir. */}
            {planos[0] && (
              <button
                type="button"
                onClick={() => void assinar(planos[0].code, true)}
                disabled={assinando !== null}
                className="rounded-[var(--radius-control)] font-medium text-cobalt-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:opacity-50"
              >
                {assinando?.semTeste ? "Abrindo…" : "Prefere boleto? Assine sem teste grátis"}
              </button>
            )}
          </div>
        ) : (
          <p className="mt-5 text-center text-xs text-volt-950/50">Cancele quando quiser, sem multa.</p>
        )}
      </div>
    </div>
  );
}
