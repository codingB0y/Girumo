"use client";

/**
 * Os planos no próprio ponto de bloqueio.
 *
 * O PR #158 fez o gate mostrar a mensagem certa e um botão "Ver planos" que
 * levava a `/painel/configuracoes`. Funcionava, mas cobrava do cliente dois
 * cliques e a perda do contexto — ele estava escrevendo uma campanha, e para
 * pagar tinha de sair da tela e procurar o plano. Sem trial, este é o único
 * momento de conversão do produto: a fricção aqui é a fricção que decide.
 *
 * Abre sobre a tela e vai direto ao checkout do Stripe.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { authenticatedFetch } from "@/lib/supabase/client";
import {
  formatarPreco,
  planosParaOferecer,
  type PlanoCatalogo,
} from "@/lib/billing/plan-display";

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
  const fecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPlanos(planosParaOferecer(Array.isArray(d) ? d : [])))
      .catch(() => setPlanos([]))
      .finally(() => setCarregando(false));
  }, []);

  // Esc fecha, e o foco entra no diálogo: sem isso quem navega por teclado fica
  // preso atrás de um overlay que não dá para alcançar.
  useEffect(() => {
    fecharRef.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onClose]);

  const assinar = useCallback(async (planCode: string) => {
    setAssinando(planCode);
    setErro(null);
    try {
      const res = await authenticatedFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout indisponível.");
      window.location.href = data.url;
    } catch (e) {
      // Mesma razão do painel de configurações: engolir aqui deixaria o botão
      // girar, parar, e a tela idêntica a antes do clique — inclusive para o
      // suporte, porque o cliente só sabe dizer "não acontece".
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-titulo"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="paywall-titulo" className="text-lg font-semibold text-volt-950">
              Escolha um plano pra continuar
            </h2>
            <p className="mt-1 text-sm text-volt-950/70">{motivo}</p>
          </div>
          <button
            ref={fecharRef}
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
                  {formatarPreco(plano.price_cents ?? 0)}
                  <span className="text-volt-950/40"> /mês</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => assinar(plano.code)}
                disabled={assinando !== null}
                className="shrink-0 rounded-[var(--radius-control)] bg-acid-500 px-4 py-2 text-sm font-semibold text-volt-950 transition-[filter] duration-[var(--duration-micro)] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:opacity-50"
              >
                {assinando === plano.code ? "Abrindo…" : "Assinar"}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-volt-950/50">
          Pague no Pix. 7 dias pra desistir e receber tudo de volta — depois disso, cancele quando quiser, sem multa.
        </p>
      </div>
    </div>
  );
}
