"use client";

import { useMemo } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  cenaDosResultados,
  conversaoCliqueEntrada,
  dinheiroOuNada,
  funilDaVenda,
  houveFalha,
  membrosPorCampanha,
  numeroOuNada,
  vendasPorCampanha,
  vendasPorGrupo,
  type CampanhaLike,
  type FatiaDoTotal,
  type PedidoLike,
} from "@/lib/painel/resultados";
import type { GrupoResumo } from "@/lib/painel/inicio";
import type { Carga } from "@/lib/painel/types";

type Props = {
  links: { cliques: number; carga: Carga };
  grupos: { lista: readonly GrupoResumo[]; carga: Carga };
  leads: { entradas: number; clientes: number; carga: Carga };
  pedidos: { lista: readonly PedidoLike[]; carga: Carga };
  campanhas: { lista: readonly CampanhaLike[]; carga: Carga };
  aoTentarDeNovo: () => void;
};

/** Travessão, não zero: o número que não chegou não vira medição. */
const NADA = "—";

/**
 * Resultados na Vitrine Aberta: o quadro de giz do balcão.
 *
 * Cinco consultas alimentam a tela, e cada número sabe de qual veio. Quem não
 * respondeu mostra travessão — a casca antiga imprimia "R$ 0,00" em "Vendas
 * desde o início" quando /api/orders falhava, com cara de caixa fechado.
 */
export function ResultadosVitrine({ links, grupos, leads, pedidos, campanhas, aoTentarDeNovo }: Props) {
  const cargas = [links.carga, grupos.carga, leads.carga, pedidos.carga, campanhas.carga];
  const cena = cenaDosResultados(cargas);

  const totalDeMembros = useMemo(
    () => grupos.lista.reduce((soma, g) => soma + (g.members ?? 0), 0),
    [grupos.lista],
  );
  const totalVendido = useMemo(
    () => pedidos.lista.reduce((soma, p) => soma + (p.value ?? 0), 0),
    [pedidos.lista],
  );
  const funil = useMemo(
    () => funilDaVenda({ cliques: links.cliques, entradas: leads.entradas, pedidos: pedidos.lista.length }),
    [links.cliques, leads.entradas, pedidos.lista.length],
  );
  const porCampanha = useMemo(
    () => membrosPorCampanha(campanhas.lista, grupos.lista),
    [campanhas.lista, grupos.lista],
  );
  const receitaPorCampanha = useMemo(
    () => vendasPorCampanha(pedidos.lista, campanhas.lista),
    [pedidos.lista, campanhas.lista],
  );
  const receitaPorGrupo = useMemo(() => vendasPorGrupo(pedidos.lista), [pedidos.lista]);

  if (cena === "carregando") {
    return (
      <div
        className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-8 lg:py-8"
        role="status"
        aria-label="Carregando os resultados"
      >
        <div className="pn-skeleton h-10 w-56 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="pn-skeleton h-24 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
          ))}
        </div>
        <div className="pn-skeleton h-64 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-8 lg:py-8">
      <header>
        <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Resultados</h1>
        <p className="mt-1 text-15 text-slate-600">Do clique ao cliente — sem número inflado.</p>
      </header>

      {cena === "erro" ? (
        <div className="pn-card rounded-[var(--radius-control)] p-6" role="alert">
          <p className="text-15 text-volt-950">Não deu para carregar seus resultados.</p>
          <p className="mt-1 text-13 text-slate-600">
            Nenhuma das consultas respondeu. Seus números continuam registrados.
          </p>
          <button
            type="button"
            onClick={aoTentarDeNovo}
            className="mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          {houveFalha(cargas) && (
            <p className="pn-aviso rounded-[var(--radius-control)] px-4 py-3" role="status">
              Parte dos números não carregou. Onde está {NADA}, é isso — não é zero.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Quadro rotulo="Cliques" valor={numeroOuNada(links.cliques, links.carga)} />
            <Quadro rotulo="Membros" valor={numeroOuNada(totalDeMembros, grupos.carga)} />
            <Quadro
              rotulo="Clique vira entrada"
              valor={conversaoCliqueEntrada(
                leads.entradas,
                links.cliques,
                links.carga === "ok" && leads.carga === "ok" ? "ok" : "erro",
              )}
              tom="cobalt"
            />
            <Quadro rotulo="Clientes" valor={numeroOuNada(leads.clientes, leads.carga)} tom="sucesso" />
            <Quadro
              rotulo="Vendas desde o início"
              valor={dinheiroOuNada(totalVendido, pedidos.carga)}
              tom="sucesso"
            />
          </div>

          <section className="pn-card rounded-[var(--radius-control)] p-6">
            <h2 className="font-brand text-20 font-bold text-volt-950">O caminho até a venda</h2>
            <div className="mt-5 space-y-4">
              {funil.map((passo) => (
                <div key={passo.rotulo}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-15 text-volt-950">{passo.rotulo}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="font-data text-20 tabular-nums text-volt-950">
                        {passo.valor.toLocaleString("pt-BR")}
                      </span>
                      {passo.doPassoAnterior && (
                        <span className="font-data text-12 text-slate-600">{passo.doPassoAnterior}</span>
                      )}
                    </span>
                  </div>
                  <span
                    className="pn-etiqueta-preco__barra mt-1.5"
                    style={{ ["--p" as string]: passo.largura }}
                    aria-hidden="true"
                  />
                </div>
              ))}
            </div>
          </section>

          <Barras
            titulo="Quem mais juntou gente"
            fatias={porCampanha}
            // Ter campanha e não ter ninguém dentro é diferente de não ter
            // campanha — mandar "crie campanhas" a quem já criou cinco só
            // esconde o problema real, que é grupo vazio.
            vazio={
              campanhas.lista.length > 0
                ? "Suas campanhas ainda não juntaram ninguém."
                : "Crie campanhas pra ver o desempenho aqui."
            }
            rodape={{ href: "/painel/campanhas", texto: "Ver campanhas →" }}
          />

          <Barras
            titulo="R$ por campanha"
            fatias={receitaPorCampanha}
            vazio="Registre seus pedidos na tela Contatos pra ver o caminho completo até a venda."
            dinheiro
          />

          <Barras
            titulo="De onde veio cada venda"
            fatias={receitaPorGrupo}
            vazio="Registre seus pedidos na tela Contatos pra ver o caminho completo até a venda."
            dinheiro
          />
        </>
      )}
    </div>
  );
}

function Quadro({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: string | null;
  tom?: "cobalt" | "sucesso";
}) {
  return (
    <div className="pn-card rounded-[var(--radius-control)] p-4">
      <p className="font-data text-12 uppercase tracking-[0.06em] text-slate-600">{rotulo}</p>
      <p
        className={cn(
          "font-data mt-2 text-28 tabular-nums",
          valor === null
            ? "text-slate-600"
            : tom === "cobalt"
              ? "text-cobalt-500"
              : tom === "sucesso"
                ? "text-success-700"
                : "text-volt-950",
        )}
      >
        {valor ?? NADA}
      </p>
    </div>
  );
}

function Barras({
  titulo,
  fatias,
  vazio,
  dinheiro,
  rodape,
}: {
  titulo: string;
  fatias: readonly FatiaDoTotal[];
  vazio: string;
  dinheiro?: boolean;
  rodape?: { href: string; texto: string };
}) {
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <section className="pn-card rounded-[var(--radius-control)] p-6">
      <h2 className="font-brand text-20 font-bold text-volt-950">{titulo}</h2>
      {fatias.length === 0 ? (
        <p className="mt-3 text-13 text-slate-600">{vazio}</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {fatias.map((fatia) => (
            <li key={fatia.nome}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-15 text-volt-950">{fatia.nome}</span>
                <span className="font-data shrink-0 text-15 tabular-nums text-volt-950">
                  {dinheiro ? brl.format(fatia.total) : fatia.total.toLocaleString("pt-BR")}
                </span>
              </div>
              <span
                className="pn-etiqueta-preco__barra mt-1.5"
                style={{ ["--p" as string]: fatia.largura }}
                aria-hidden="true"
              />
            </li>
          ))}
        </ul>
      )}
      {rodape && (
        <Link
          href={rodape.href}
          className="font-data mt-5 inline-flex min-h-11 items-center text-13 text-cobalt-500"
        >
          {rodape.texto}
        </Link>
      )}
    </section>
  );
}
