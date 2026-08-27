"use client";

/**
 * O bloco de erro do gate de plano, com a saída embutida.
 *
 * Existe para as telas não repetirem a mesma decisão quatro vezes — e para que
 * a saída seja a mesma em todas. Quando o erro veio do gate (tem `upgradeUrl`),
 * o botão abre os planos ali mesmo; quando é erro comum, mostra só a mensagem.
 *
 * A distinção importa: sugerir upgrade a quem esbarrou num defeito nosso é pior
 * do que não sugerir nada.
 */

import { useState } from "react";

import { PlanPaywall } from "./plan-paywall";

interface PlanLimitAlertProps {
  /** Mensagem do erro. `null` esconde o bloco inteiro. */
  message: string | null;
  /** Presente só quando o erro veio do gate de plano (402). */
  upgradeUrl: string | null;
  className?: string;
}

export function PlanLimitAlert({ message, upgradeUrl, className }: PlanLimitAlertProps) {
  const [abrirPlanos, setAbrirPlanos] = useState(false);

  if (!message) return null;

  return (
    <>
      <div
        role="alert"
        className={
          className ??
          "flex flex-wrap items-center justify-between gap-3 rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta"
        }
      >
        <p className="min-w-0">{message}</p>
        {upgradeUrl && (
          <button
            type="button"
            onClick={() => setAbrirPlanos(true)}
            className="inline-flex shrink-0 items-center rounded-[var(--radius-control)] bg-acid-500 px-4 py-2 text-xs font-semibold text-volt-950 transition-[filter] duration-[var(--duration-micro)] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
          >
            Ver planos
          </button>
        )}
      </div>

      {abrirPlanos && <PlanPaywall motivo={message} onClose={() => setAbrirPlanos(false)} />}
    </>
  );
}
