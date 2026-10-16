// apps/web/src/components/painel/configuracoes/bling-painel-vendas.tsx
"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de site-proprio-painel.tsx).
import React from "react";

import Link from "next/link";
import { ChevronRight, CircleMinus, Megaphone, Users } from "lucide-react";
import type { UltimaDoCartao } from "@/lib/bling/cartao";
import { cn } from "@/lib/utils";
import { AJUDA, ANEL, BLOCO, COR_DO_TOM, TITULO } from "./bling-painel-estilo";
import {
  contagem,
  detalheDasFalhas,
  detalheDoMeta,
  reais,
  textoDaOrigem,
  textoDoMeta,
  type NumerosDoCartao,
} from "./bling-painel-texto";
import { quando } from "./site-proprio-painel";

/** Os números de 30 dias do cartão (mockup Conectado). Contagens e somas vêm do banco (`bling_resumo`). */
export function NumerosDoBling({ n }: { n: NumerosDoCartao }) {
  const blocos = [
    { rotulo: "Vendas do Bling", valor: n.vendas, detalhe: reais(n.vendido), dado: true },
    {
      rotulo: "Com origem",
      valor: n.com_origem.anuncio + n.com_origem.grupo,
      detalhe: `Anúncio ${contagem(n.com_origem.anuncio)} · Grupo ${contagem(n.com_origem.grupo)}`,
      dado: true,
    },
    { rotulo: "Sem origem", valor: n.sem_origem, detalhe: "o telefone não veio de anúncio nem de grupo", dado: false },
    { rotulo: "Enviadas ao Meta", valor: n.meta.enviado, detalhe: detalheDoMeta(n.meta), dado: false },
    { rotulo: "Falhas", valor: n.falhas, detalhe: detalheDasFalhas(n.falhas, n.pendentes), dado: false },
  ];
  return (
    <section className={BLOCO} aria-labelledby="bling-numeros-titulo">
      <h3 id="bling-numeros-titulo" className={TITULO}>
        Últimos 30 dias
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {blocos.map((b) => (
          <div key={b.rotulo} className="min-w-0 rounded-[var(--radius-control)] bg-canvas-100 p-4">
            <dt className="text-13 text-slate-600">{b.rotulo}</dt>
            <dd
              className={cn(
                "font-data mt-1 text-28 tabular-nums",
                b.rotulo === "Falhas" && b.valor > 0 ? "text-danger-700" : "text-volt-950",
              )}
            >
              {contagem(b.valor)}
            </dd>
            <dd className={cn("mt-1 text-13", b.dado ? "font-data tabular-nums text-volt-950" : "text-slate-600")}>{b.detalhe}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const ICONE_DA_ORIGEM = { anuncio: Megaphone, grupo: Users, sem_origem: CircleMinus } as const;

function LinhaDaVenda({ u, agora }: { u: UltimaDoCartao; agora: Date }) {
  const meta = textoDoMeta(u);
  const Icone = u.origem ? ICONE_DA_ORIGEM[u.origem] : null;
  return (
    <tr className="border-t border-line-200 align-top">
      <td className="font-data py-2.5 pr-3 text-13 tabular-nums text-volt-950">{u.hora ? quando(u.hora, agora) : "—"}</td>
      <td className="py-2.5 pr-3">
        <span className="block text-13 font-semibold text-volt-950">{u.cliente ?? "Sem nome no Bling"}</span>
        <span className="font-data mt-0.5 block text-12 text-slate-600">{u.telefone_mascarado ?? "sem telefone"}</span>
      </td>
      <td className="font-data py-2.5 text-right text-13 tabular-nums text-volt-950">{u.valor === null ? "—" : reais(u.valor)}</td>
      <td className="py-2 pl-4 pr-3">
        {Icone ? (
          <span className="inline-flex min-h-6 items-center gap-1.5 rounded-[var(--radius-chip)] bg-canvas-100 px-2 py-1 text-12 font-medium text-volt-950">
            <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {textoDaOrigem(u)}
          </span>
        ) : (
          <span className="text-13 text-slate-600">{textoDaOrigem(u)}</span>
        )}
      </td>
      <td className={cn("py-2.5 pr-3 text-13", COR_DO_TOM[meta.tom])}>
        <span className="block">{meta.texto}</span>
        {meta.detalhe && <span className="block text-12">{meta.detalhe}</span>}
      </td>
      <td className="py-2.5 text-13 text-volt-950">
        <span className="block">{u.situacao ?? "—"}</span>
        {u.tipo === "pedido" && <span className="block text-12 text-slate-600">pedido · não conta como venda</span>}
      </td>
    </tr>
  );
}

/** As últimas vendas e pedidos (cartao.ts manda 8). Telefone já vem mascarado da rota. */
export function UltimasDoBling({ ultimas, agora }: { ultimas: UltimaDoCartao[]; agora: Date }) {
  return (
    <section className={BLOCO} aria-labelledby="bling-ultimas-titulo">
      <h3 id="bling-ultimas-titulo" className={TITULO}>
        Últimas vendas
      </h3>
      {ultimas.length === 0 ? (
        <p className={AJUDA}>Nenhuma venda recebida ainda.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead>
              <tr className="text-12 text-slate-600">
                <th scope="col" className="pb-2 pr-3 font-normal">Hora</th>
                <th scope="col" className="pb-2 pr-3 font-normal">Cliente</th>
                <th scope="col" className="pb-2 text-right font-normal">Valor</th>
                <th scope="col" className="pb-2 pl-4 pr-3 font-normal">Origem</th>
                <th scope="col" className="pb-2 pr-3 font-normal">Meta</th>
                <th scope="col" className="pb-2 font-normal">Situação no Bling</th>
              </tr>
            </thead>
            <tbody>
              {ultimas.map((u, i) => (
                <LinhaDaVenda key={`${u.hora}-${i}`} u={u} agora={agora} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link
        href="/painel/vendas"
        className={cn("mt-2 inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-cobalt-500", ANEL)}
      >
        Ver todas em Vendas
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
