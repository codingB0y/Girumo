"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Lock } from "lucide-react";
import { useRole } from "@/components/painel/role-provider";
import { destinoDaPagina } from "@/lib/painel-nav";

const VENDAS = "/painel/vendas";

/** Mockup "Área não liberada": a vendedora numa página que o dono não liberou. */
function AreaNaoLiberada({ loja }: { loja: string | null }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-6 py-12">
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-xl border border-line-200 bg-paper-0 text-slate-600">
        <Lock className="h-[22px] w-[22px]" />
      </span>
      <h1 className="font-brand text-[22px] font-extrabold tracking-[-0.02em] text-volt-950">Essa área não foi liberada pra você</h1>
      <p className="text-15 text-slate-600">
        Quem escolhe o que cada pessoa da equipe acessa é o dono da {loja ?? "loja"}. Se você precisa disso pro seu
        trabalho, peça pra ele liberar em Configurações › Equipe.
      </p>
      <Link
        href={VENDAS}
        className="mt-2 inline-flex h-12 items-center rounded-[var(--radius-control)] bg-cobalt-500 px-5 text-15 font-semibold text-paper-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      >
        Voltar pra Vendas
      </Link>
    </div>
  );
}

/**
 * Guarda de página da vendedora (spec 2026-10-07 §1, "Página"). Só experiência:
 * quem barra de verdade é o guard das rotas de API (PR 3). Enquanto o
 * `/api/auth/me` não responde, não monta a página — senão a Início do dono
 * dispararia as chamadas dela (403 para a vendedora) e piscaria na tela.
 * Vendedora em `/painel` vai para Vendas; fora de `paginaLiberada`, o bloqueio.
 * Outros papéis (e papel desconhecido depois de carregar): a página de sempre.
 */
export function GuardaDeModulo({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { carregado, acesso, tenantName } = useRole();
  const destino = carregado ? destinoDaPagina(acesso, pathname) : null;

  useEffect(() => {
    if (destino === "ir-para-vendas") router.replace(VENDAS);
  }, [destino, router]);

  if (destino === "mostrar") return <>{children}</>;
  if (destino === "bloquear") return <AreaNaoLiberada loja={tenantName} />;
  return (
    <div role="status" aria-label="Carregando o painel" className="space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <div className="pn-skeleton h-9 w-48 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
      <div className="pn-skeleton h-64 rounded-xl" data-testid="painel-skeleton" />
    </div>
  );
}
