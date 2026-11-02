"use client";

import { Suspense } from "react";
import { useCasca } from "@/components/painel/casca-context";
import { ErroDeCarga } from "@/components/painel/erro-de-carga";
import { useRole } from "@/components/painel/role-provider";
import { acessoRestrito } from "@/lib/auth/modulos";
import { AtivarRecuperar } from "./ativar";

/**
 * Porta das telas do Recuperar: só deixa passar quem tem o add-on ligado. O estado
 * vem da casca; falha na leitura nunca vira oferta (seria vender a quem já paga).
 */
export function PortaDoRecuperar({ children }: { children: React.ReactNode }) {
  const { recuperar, recuperarFalhou, recarregarRecuperar } = useCasca();
  const { carregado, acesso } = useRole();

  if (recuperar === null) {
    // `/api/auth/me` que falhou (acesso nulo): a casca não pergunta o status, então o esqueleto
    // ficaria para sempre. Vira o erro com "Tentar de novo", que pergunta direto.
    if (recuperarFalhou || (carregado && acesso === null)) {
      return (
        <section className="px-5 py-6 lg:px-8">
          <ErroDeCarga titulo="Não deu para carregar o Recuperar." aoTentarDeNovo={recarregarRecuperar} />
        </section>
      );
    }
    return (
      <section className="px-5 py-6 lg:px-8">
        <span role="status" aria-label="Carregando o Recuperar" className="pn-skeleton block h-7 w-40 rounded-[var(--radius-chip)]" />
      </section>
    );
  }

  if (!recuperar.enabled) {
    // A vendedora não busca a oferta: a rota daria 403 para ela.
    if (acessoRestrito(acesso)) {
      return (
        <section className="px-5 py-6 lg:px-8">
          <h1 className="text-20 font-semibold text-volt-950">Recuperar</h1>
          <p className="mt-2 max-w-[60ch] text-sm text-slate-600">
            O Recuperar não está ativo nesta loja. Quem ativa é o dono ou um admin da loja.
          </p>
        </section>
      );
    }
    return (
      // Suspense: `useSearchParams` sem ele derruba o pré-render da página.
      <Suspense fallback={null}>
        <AtivarRecuperar />
      </Suspense>
    );
  }

  return <>{children}</>;
}
