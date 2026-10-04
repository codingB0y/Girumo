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

import { useCallback, useEffect, useState } from "react";

import { useTrial } from "@/components/painel/trial/use-trial";
import { useFocusTrap } from "@/components/painel/use-focus-trap";
import { abrirCheckout } from "@/lib/billing/checkout-client";
import {
  formatarPreco,
  planosParaOferecer,
  type PlanoCatalogo,
} from "@/lib/billing/plan-display";
import { linhaDoPrecoNoTeste } from "@/lib/billing/trial-copy";

interface PlanPaywallProps {
  /** A mensagem do 402, para o cliente saber o que o trouxe até aqui. */
  motivo: string;
  onClose: () => void;
}

export function PlanPaywall({ motivo, onClose }: PlanPaywallProps) {
  const [planos, setPlanos] = useState<PlanoCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [assinando, setAssinando] = useState<string | null>(null);
  // O foco entra no primeiro tabulável (o Fechar), fica preso no diálogo e volta
  // ao "Ver planos" que o abriu: aria-modal só promete isso, quem cumpre é a trava.
  const dialogoRef = useFocusTrap<HTMLDivElement>(true);
  const { view } = useTrial();
  // Flag desligada ou leitura falhou → `view` nulo → o paywall de antes do teste.
  // `!emTeste` deixa local a regra de que teste em andamento (cancelado ou não)
  // nunca vê o rodapé que anuncia a cobrança.
  const comTeste = view?.elegivel === true && !view.emTeste;

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPlanos(planosParaOferecer(Array.isArray(d) ? d : [])))
      .catch(() => setPlanos([]))
      .finally(() => setCarregando(false));
  }, []);

  // Só o Esc depende de `onClose`. O foco fica fora deste efeito: o PlanLimitAlert
  // passa uma arrow nova a cada render, e refocar aqui jogaria o foco de volta no
  // Fechar a cada re-render da tela de trás.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onClose]);

  const assinar = useCallback(async (planCode: string, semTeste = false) => {
    setAssinando(planCode);
    setErro(null);
    try {
      await abrirCheckout(planCode, { semTeste });
    } catch (e) {
      // Mesma razão do painel de configurações: engolir aqui deixaria o botão
      // girar, parar, e a tela idêntica a antes do clique — inclusive para o
      // suporte, porque o cliente só sabe dizer "não acontece". Inclui o 409 de
      // quem já está em teste ("use Gerenciar cobrança").
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o checkout.");
      setAssinando(null);
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-volt-950/70 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-titulo"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-paper-0 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="paywall-titulo" className="text-lg font-semibold text-volt-950">
              {comTeste ? "Teste 7 dias grátis pra continuar" : "Escolha um plano pra continuar"}
            </h2>
            <p className="mt-1 text-sm text-volt-950/70">{motivo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-xl leading-none text-volt-950/50 transition-colors hover:text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
          >
            ×
          </button>
        </div>

        {erro && (
          <p role="alert" className="mt-4 rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta">
            {erro}
          </p>
        )}

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

          {planos.map((plano) => (
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
                className="min-h-11 shrink-0 rounded-[var(--radius-control)] bg-cobalt-500 px-4 py-2 text-sm font-semibold text-white transition-[filter] duration-[var(--duration-micro)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:opacity-50"
              >
                {assinando === plano.code ? "Abrindo…" : comTeste ? "Testar grátis" : "Assinar"}
              </button>
            </div>
          ))}
        </div>

        {comTeste ? (
          <div className="mt-5 space-y-2 text-center text-xs text-volt-950/60">
            <p>A cobrança começa no 8º dia, no cartão que você cadastrar. Cancele antes e não paga nada.</p>
            {/* ponytail: boleto abre o 1º plano (o de entrada); outro plano no
                boleto vai por Configurações › Plano. Seletor aqui só se o suporte pedir. */}
            {planos[0] && (
              <button
                type="button"
                onClick={() => void assinar(planos[0].code, true)}
                disabled={assinando !== null}
                className="rounded-[var(--radius-control)] font-medium text-cobalt-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:opacity-50"
              >
                Prefere boleto? Assine sem teste grátis
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
