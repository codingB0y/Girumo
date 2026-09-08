"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { diaMesBR } from "@/lib/date-br";

export type PlanoNaTela = { id: string; code: string; name: string };

export type PropsDoPlano = {
  /**
   * Três valores, não dois: "ainda não voltou" e "voltou com falha" pedem telas
   * diferentes. Tratar o primeiro como o segundo mostra "Não deu para carregar"
   * a quem só esperou meio segundo — e tratá-lo como sucesso afirma "sem plano"
   * a quem tem plano.
   */
  carga: "carregando" | "ok" | "erro";
  nome: string | null;
  codigo: string | null;
  /** Cruzado com o estado da assinatura, não lido do `plan_id`. */
  vigente: boolean;
  /** Frase do estado quando a assinatura não concede acesso. */
  recado: string | null;
  renovaEm: string | null;
  planos: readonly PlanoNaTela[];
  /** A consulta do catálogo é outra: pode falhar sozinha. */
  cargaDosPlanos: "carregando" | "ok" | "erro";
  assinando: string | null;
  abrindoPortal: boolean;
  erro: string | null;
  onAssinar: (codigo: string) => void;
  onPortal: () => void;
};

/**
 * O plano como etiqueta de peça (spec 12.6).
 *
 * Os outros planos viram linhas de romaneio, sem preço: o preço vive no
 * checkout, e imprimir um número aqui cria a segunda verdade que a série já
 * pagou caro para não ter.
 */
export function AbaPlano({
  carga,
  nome,
  codigo,
  vigente,
  recado,
  renovaEm,
  planos,
  cargaDosPlanos,
  assinando,
  abrindoPortal,
  erro,
  onAssinar,
  onPortal,
}: PropsDoPlano) {
  const renova = diaMesBR(renovaEm);
  const outros = planos.filter((p) => p.code !== "FREE" && p.code !== codigo);

  if (carga === "carregando") {
    return (
      <div
        className="pn-skeleton h-40 rounded-[var(--radius-control)]"
        data-testid="painel-skeleton"
        role="status"
        aria-label="Carregando o plano"
      />
    );
  }

  if (carga === "erro") {
    return (
      <section className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8" data-testid="configuracoes-plano">
        <p className="text-[14px] text-slate-600">
          Não deu para carregar o plano agora. Atualize a página em alguns instantes.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="configuracoes-plano" className="space-y-6">
      {nome ? (
        <div className="pn-etiqueta-preco">
          <div className="flex flex-wrap items-center gap-3">
            <p className="pn-etiqueta-preco__nome text-[32px]">{nome}</p>
            <span className={cn("pn-chip", vigente ? "text-success-700" : "text-danger-700")}>
              {vigente ? "Ativa" : "Inativa"}
            </span>
          </div>

          {/* O que a assinatura diz, não o que o `plan_id` aponta. */}
          <p className="font-data mt-2 text-13 tabular-nums text-slate-600">
            {vigente
              ? renova
                ? `Renova em ${renova}`
                : "Assinatura ativa"
              : (recado ?? "Assinatura sem cobrança em dia")}
          </p>

          {/* FREE nunca teve Stripe: sem o gate, o POST /api/billing/portal
              devolve 404 "Cliente Stripe nao encontrado" e o cliente ve erro
              tecnico num botao que a casca antiga nem mostrava. */}
          {codigo && codigo !== "FREE" && (
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onPortal}
              disabled={abrindoPortal}
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-[14px] text-volt-950 disabled:opacity-50"
            >
              {abrindoPortal && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Gerenciar cobrança
            </button>
            <Link href="/painel/configuracoes/cancelar" className="text-13 text-slate-600 hover:text-danger-700">
              Cancelar assinatura
            </Link>
          </div>
          )}
        </div>
      ) : (
        <div className="pn-etiqueta-preco">
          <p className="pn-etiqueta-preco__nome text-[32px]">Sem plano</p>
          <p className="mt-2 text-13 text-slate-600">Escolha um plano abaixo para liberar tudo.</p>
        </div>
      )}

      {outros.length > 0 && (
        <div>
          <p className="font-data text-12 uppercase tracking-[0.06em] text-slate-600">
            {nome ? "Trocar de plano" : "Planos"}
          </p>
          <ul className="mt-2">
            {outros.map((p) => (
              <li
                key={p.id}
                className="flex min-h-12 items-center justify-between gap-4 border-b border-line-200 py-2 last:border-b-0"
              >
                <span className="font-data text-13 text-volt-950">{p.name}</span>
                <button
                  type="button"
                  onClick={() => onAssinar(p.code)}
                  disabled={assinando === p.code}
                  className="inline-flex h-10 items-center gap-2 text-13 text-cobalt-500 disabled:opacity-50"
                >
                  {assinando === p.code && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Ver o que libera
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* "Nenhum outro plano" é sobre a lista já filtrada, não sobre o catálogo
          inteiro — e só vale quando a consulta de planos respondeu: com ela fora
          do ar a lista chega vazia, e a frase seria mentira. */}
      {cargaDosPlanos === "ok" && outros.length === 0 && (
        <p className="text-[14px] text-slate-600">Nenhum outro plano disponível agora.</p>
      )}

      {erro && (
        <p role="alert" className="text-13 text-danger-700">
          {erro}
        </p>
      )}
    </section>
  );
}
