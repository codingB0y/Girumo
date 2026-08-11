"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export function DashboardSkeleton() {
  return (
    <div
      className="mx-auto max-w-[1200px] space-y-5 px-4 py-8 sm:px-8"
      role="status"
      aria-label="Carregando seu painel"
    >
      <div className="pn-skeleton h-9 w-56 rounded-lg" style={{ ["--i" as string]: 0 }} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="pn-skeleton h-44 rounded-2xl lg:col-span-5" style={{ ["--i" as string]: 1 }} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:col-span-7">
          {[2, 3, 4].map((i) => (
            <div key={i} className="pn-skeleton h-44 rounded-2xl" style={{ ["--i" as string]: i }} />
          ))}
        </div>
      </div>
      <div className="pn-skeleton h-24 rounded-2xl" style={{ ["--i" as string]: 5 }} />
    </div>
  );
}

/**
 * Falha de carregamento. Antes, um /api/session fora do ar virava
 * `live: false` e a tela dizia "Bem-vindo à Girumo" pra quem já era cliente.
 */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
      <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Início</h1>

      <div className="pn-card mt-6 rounded-2xl p-8">
        <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:text-left">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-alerta/10 text-alerta">
            <AlertTriangle className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold text-volt-950">Não deu pra carregar seus dados</h2>
            <p className="mt-2 text-sm leading-relaxed text-aco/75">
              Seus grupos, campanhas e contatos continuam salvos — foi só esta tela que não conseguiu
              buscar. Tente de novo em instantes.
            </p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="hf-shine inline-flex items-center gap-2 rounded-[10px] bg-cobalt-500 px-6 py-3 text-sm font-medium text-white shadow-sm transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:brightness-110 active:scale-[0.97]"
          >
            <RefreshCw className="h-4 w-4" /> Tentar de novo
          </button>
        </div>
      </div>
    </div>
  );
}
