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

export type ModoDoPaywall = "carregando" | "normal" | "teste" | "em_teste";

/**
 * Qual paywall mostrar.
 *
 * - `carregando`: a leitura do teste ainda não voltou. Fora do painel o paywall lê
 *   sozinho e nasce sem resposta; abrir como "Escolha um plano" e virar "Teste 7 dias
 *   grátis" segundos depois fazia o leitor de tela anunciar um diálogo e mostrar outro.
 * - `em_teste`: o checkout recusa (409) quem já está testando — cancelado ou não —,
 *   então N botões "Assinar" seriam N becos sem saída. Vem antes de `elegivel` para
 *   o teste em andamento nunca ver o rodapé que anuncia a cobrança.
 * - `teste`: elegível, e não acabou de voltar do Checkout. Durante `ativando` o
 *   webhook ainda não gravou o teste; oferecer "Testar grátis" de novo seria o
 *   convite a ativar duas vezes.
 * - `normal`: flag desligada ou leitura falhou (`view` nulo) → o paywall de antes do teste.
 */
export function modoDoPaywall(view: TrialView | null, ativando: boolean, carregado: boolean): ModoDoPaywall {
  if (!carregado) return "carregando";
  if (view?.emTeste) return "em_teste";
  if (view?.elegivel === true && !ativando) return "teste";
  return "normal";
}

const TITULO: Record<ModoDoPaywall, string> = {
  carregando: "Carregando…",
  normal: "Escolha um plano pra continuar",
  teste: "Teste 7 dias grátis pra continuar",
  em_teste: "Você está no teste grátis",
};

// Hover escurece (cobalt-700, 7,5:1) em vez de clarear: brightness-110 tirava o
// branco do mínimo de 4,5:1.
const BOTAO_COBALTO =
  "min-h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-4 py-2 text-sm font-semibold text-white transition-colors duration-[var(--duration-micro)] hover:bg-cobalt-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

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
  const { view, ativando, carregado } = useTrial();
  const modo = modoDoPaywall(view, ativando, carregado);
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

  // Voltar do Stripe pelo botão Voltar restaura a página do bfcache com o estado de
  // antes da navegação: sem isto o diálogo ficaria em "Abrindo…", e mudo, para sempre.
  useEffect(() => {
    const aoVoltar = (e: PageTransitionEvent) => {
      if (e.persisted) setAssinando(null);
    };
    window.addEventListener("pageshow", aoVoltar);
    return () => window.removeEventListener("pageshow", aoVoltar);
  }, []);

  const assinar = useCallback(
    async (botao: HTMLButtonElement, planCode: string, semTeste = false) => {
      // O botão que abre fica só `aria-disabled` (desabilitado, perderia o foco):
      // quem barra o segundo clique é esta guarda.
      if (assinando) return;
      // O Safari não foca botão no clique: o foco ficaria no ×, que desabilita
      // agora, e cairia no <body>.
      botao.focus();
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
    },
    [assinando],
  );

  // Montado desde o 1º render: região viva que nasce já com texto não é anunciada.
  // Só conta os planos quando a lista está na tela, e cala depois de um erro — o
  // alerta já fala, e "N planos" de novo seria ruído.
  const listaNaTela = (modo === "normal" || comTeste) && !carregando && planos.length > 0;
  const status = assinando
    ? "Abrindo o checkout seguro…"
    : erro || !listaNaTela
      ? ""
      : `${planos.length} ${planos.length === 1 ? "plano carregado" : "planos carregados"}`;
  const abrindoBoleto = assinando?.semTeste === true;

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
              {TITULO[modo]}
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
            className="min-h-11 min-w-11 shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-xl leading-none text-volt-950/50 transition-colors hover:text-volt-950 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
          >
            ×
          </button>
        </div>

        <p role="status" className="sr-only">
          {status}
        </p>

        {erro && (
          <p role="alert" className="mt-4 rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta">
            {erro}
          </p>
        )}

        {modo === "carregando" ? null : modo === "em_teste" ? (
          // Um caminho só: no teste, a troca de plano vai pelo portal. `<a>` e não
          // `Link`: a navegação inteira desmonta o paywall de onde quer que ele tenha
          // aberto. Com `Link`, quem o abriu e sobrevive à navegação (a faixa do
          // layout, um 402 na própria Configurações) o deixaria aberto por cima.
          <div className="mt-5 space-y-3">
            <p className="text-sm text-volt-950/70">
              Durante o teste grátis, a troca de plano é feita em Gerenciar cobrança.
            </p>
            {/* "aba Plano", não "› Plano": o leitor de tela lê o "›" como sinal. */}
            <a href="/painel/configuracoes?secao=plano" className={`inline-flex items-center ${BOTAO_COBALTO}`}>
              Trocar de plano em Configurações, aba Plano
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
                <a className="font-medium underline" href="/painel/configuracoes?secao=plano">
                  Configurações
                </a>{" "}
                pra escolher.
              </p>
            )}

            {planos.map((plano) => {
              const abrindoEste = assinando?.planCode === plano.code && !assinando.semTeste;
              const acao = comTeste ? "Testar grátis" : "Assinar";
              return (
                // flex-wrap: a 320px o botão desce para baixo do preço em vez de espremê-lo.
                <div
                  key={plano.code}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-volt-950/[0.08] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-volt-950">{plano.name}</p>
                    <p className="text-sm text-volt-950/60">
                      {comTeste
                        ? linhaDoPrecoNoTeste(plano.price_cents ?? 0)
                        : `${formatarPreco(plano.price_cents ?? 0)} /mês`}
                    </p>
                  </div>
                  {/* Quem abre o Checkout fica focável (`aria-disabled`, sem esmaecer):
                      com `disabled` o foco caía no <body> e o "Abrindo…" nunca era lido. */}
                  <button
                    type="button"
                    onClick={(e) => void assinar(e.currentTarget, plano.code)}
                    disabled={assinando !== null && !abrindoEste}
                    aria-disabled={abrindoEste || undefined}
                    // Três botões "Assinar" iguais não dizem a quem usa leitor de tela
                    // qual plano cada um assina.
                    aria-label={
                      abrindoEste
                        ? `Abrindo o checkout do plano ${plano.name}`
                        : `${acao} o plano ${plano.name}`
                    }
                    className={`shrink-0 disabled:opacity-50 ${BOTAO_COBALTO}`}
                  >
                    {abrindoEste ? "Abrindo…" : acao}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {modo === "carregando" ? null : comTeste ? (
          <div className="mt-5 space-y-2 text-center text-xs text-volt-950/60">
            <p>A cobrança começa no 8º dia, no cartão que você cadastrar. Cancele antes e não paga nada.</p>
            {/* ponytail: boleto abre o 1º plano (o de entrada), e o texto diz qual;
                boleto em outro plano vai pelo modal de oferta (TrialOffer), que tem a
                escolha do plano. Seletor aqui só se o suporte pedir. */}
            {planos[0] && (
              <button
                type="button"
                onClick={(e) => void assinar(e.currentTarget, planos[0].code, true)}
                disabled={assinando !== null && !abrindoBoleto}
                aria-disabled={abrindoBoleto || undefined}
                className="min-h-11 rounded-[var(--radius-control)] font-medium text-cobalt-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:opacity-50"
              >
                {abrindoBoleto ? "Abrindo…" : `Prefere boleto? Assine o plano ${planos[0].name} sem teste grátis`}
              </button>
            )}
          </div>
        ) : (
          <p className="mt-5 text-center text-xs text-volt-950/60">Cancele quando quiser, sem multa.</p>
        )}
      </div>
    </div>
  );
}
