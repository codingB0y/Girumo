"use client";

import Link from "next/link";
import { useState } from "react";
import { brl } from "@/components/painel/home/format";
import { diasRestantesNoMes, marcasDaFita, rotulosDaFita } from "@/lib/painel/inicio";
import { Odometro } from "./odometro";

const PASSO_DA_MARCA = 5_000;

type Props = {
  mes: string;
  faturamento: number;
  pedidos: number;
  quemMaisVendeu: { nome: string; valor: number } | null;
  meta: number | null;
  agora: Date;
  onMetaSalva: (valor: number) => void;
};

/**
 * Bloco 2 da Início (12.3): o caixa do mês como manchete. R$ em Manrope 800
 * 64/44 (spec 3.3), fita métrica com marcas a cada R$ 5.000. Sem pedido, o
 * estado é onboarding ("Registrar pedido"), nunca R$ 0.
 */
export function CaixaDoMes({ mes, faturamento, pedidos, quemMaisVendeu, meta, agora, onMetaSalva }: Props) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvarMeta() {
    const valor = Math.round(Number(rascunho.replace(/\./g, "").replace(",", ".")));
    if (!valor || valor <= 0 || salvando) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyGoalRevenue: valor }),
      });
      if (res.ok) {
        onMetaSalva(valor);
        setEditando(false);
      }
    } finally {
      setSalvando(false);
    }
  }

  const progresso = meta && meta > 0 ? Math.min(1, faturamento / meta) : 0;
  const faltam = diasRestantesNoMes(agora);

  return (
    <section data-testid="inicio-caixa" className="pn-card rounded-[var(--radius-control)] p-5 lg:p-6">
      <p className="text-13 text-slate-600">Vendido em {mes}</p>
      {pedidos === 0 ? (
        <>
          <p className="font-brand mt-2 text-20 font-bold text-volt-950 lg:text-28">Nenhum pedido registrado</p>
          <p className="mt-1 text-15 text-slate-600">O pedido nasce quando você anota a venda na ficha da cliente.</p>
          <Link
            href="/painel/contatos"
            className="mt-4 inline-flex h-11 items-center rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-15 font-semibold text-white"
          >
            Registrar pedido
          </Link>
        </>
      ) : (
        <>
          <Odometro
            valor={brl.format(faturamento)}
            className="font-brand mt-1 block text-[44px] font-extrabold leading-none tracking-[-0.02em] text-volt-950 lg:text-64"
          />
          <p className="mt-2 text-15 text-slate-600">
            {pedidos} {pedidos === 1 ? "pedido" : "pedidos"}
            {quemMaisVendeu && ` · quem mais vendeu: ${quemMaisVendeu.nome} (${brl.format(quemMaisVendeu.valor)})`}
          </p>
        </>
      )}

      {meta && meta > 0 ? (
        <div className="mt-5">
          <div
            className="pn-fita"
            role="progressbar"
            aria-valuenow={Math.round(progresso * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${brl.format(faturamento)} de ${brl.format(meta)}`}
            style={{ ["--p" as string]: progresso }}
          >
            {Array.from({ length: marcasDaFita(meta, PASSO_DA_MARCA) - 1 }, (_, i) => (
              <i
                key={i}
                className="pn-fita__marca"
                style={{ left: `${((i + 1) / marcasDaFita(meta, PASSO_DA_MARCA)) * 100}%` }}
                aria-hidden="true"
              />
            ))}
            <span className="pn-fita__cursor" aria-hidden="true" />
          </div>
          <div className="pn-fita__rotulos" aria-hidden="true">
            {rotulosDaFita(meta).map((r) => (
              <span key={r.posicao} style={{ left: `${r.posicao}%` }}>
                {r.texto}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <span className="font-data text-13 tabular-nums text-slate-600">
              de {brl.format(meta)} · {faltam === 0 ? "último dia" : `faltam ${faltam} dias`}
            </span>
            {editando ? (
              <MetaEditor rascunho={rascunho} salvando={salvando} onChange={setRascunho} onSalvar={salvarMeta} onCancelar={() => setEditando(false)} />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRascunho(String(meta));
                  setEditando(true);
                }}
                className="min-h-11 text-13 font-semibold text-cobalt-500"
              >
                Editar meta
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line-200 pt-4">
          <span className="text-15 text-slate-600">A fita mede o mês contra a sua meta.</span>
          {editando ? (
            <MetaEditor rascunho={rascunho} salvando={salvando} onChange={setRascunho} onSalvar={salvarMeta} onCancelar={() => setEditando(false)} />
          ) : (
            <button
              type="button"
              onClick={() => {
                setRascunho("");
                setEditando(true);
              }}
              className="min-h-11 text-15 font-semibold text-cobalt-500"
            >
              Definir a meta do mês
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function MetaEditor({
  rascunho,
  salvando,
  onChange,
  onSalvar,
  onCancelar,
}: {
  rascunho: string;
  salvando: boolean;
  onChange: (v: string) => void;
  onSalvar: () => void;
  onCancelar: () => void;
}) {
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSalvar();
      }}
    >
      <label className="sr-only" htmlFor="meta-do-mes">
        Meta de faturamento do mês
      </label>
      <input
        id="meta-do-mes"
        autoFocus
        inputMode="numeric"
        value={rascunho}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancelar()}
        placeholder="50000"
        className="font-data h-11 w-32 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[16px] tabular-nums text-volt-950"
      />
      <button
        type="submit"
        disabled={salvando}
        className="h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-15 font-semibold text-white disabled:opacity-50"
      >
        {salvando ? "…" : "Salvar"}
      </button>
    </form>
  );
}
