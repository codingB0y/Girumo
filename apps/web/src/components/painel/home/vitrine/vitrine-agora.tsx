"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Oferta = {
  id: string;
  name: string;
  keyword: string;
  slots: number;
  status: "draft" | "open" | "closed";
};

/**
 * Bloco 4 (12.3): a oferta relâmpago aberta como etiqueta AO VIVO (o Acid desta
 * tela), duas fechadas em Canvas abaixo. A fila e o cronômetro entram no PR 7,
 * junto com a tela da oferta.
 */
export function VitrineAgora() {
  const [ofertas, setOfertas] = useState<Oferta[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/relampago/offers")
      .then((r) => (r.ok ? r.json() : { offers: [] }))
      .then((data: { offers?: Oferta[] }) => {
        if (!cancelado) setOfertas(Array.isArray(data?.offers) ? data.offers : []);
      })
      .catch(() => {
        if (!cancelado) setOfertas([]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  if (ofertas === null) {
    return (
      <div
        className="pn-skeleton h-28 rounded-[var(--radius-control)]"
        data-testid="painel-skeleton"
        role="status"
        aria-label="Carregando o que está na vitrine"
      />
    );
  }

  const aberta = ofertas.find((o) => o.status === "open") ?? null;
  const fechadas = ofertas.filter((o) => o.status === "closed").slice(0, 2);

  if (!aberta && fechadas.length === 0) {
    return (
      <div className="pn-card rounded-[var(--radius-control)] p-5">
        <p className="text-15 text-volt-950">Nenhuma oferta no ar.</p>
        <p className="mt-1 text-13 text-slate-600">A oferta relâmpago abre uma fila: quem comenta a palavra-chave primeiro leva.</p>
        <Link href="/painel/relampago" className="mt-3 inline-flex min-h-11 items-center text-15 font-semibold text-cobalt-500">
          Criar oferta relâmpago
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {aberta && (
        <Link href="/painel/relampago" data-testid="inicio-oferta-aberta" className="pn-etiqueta-preco block min-h-[112px] lg:min-h-[128px]">
          <span className="pn-chip pn-chip--acid absolute right-4 top-4">Ao vivo</span>
          <span className="pn-etiqueta-preco__nome block pr-24 text-[24px] lg:text-32">{aberta.name}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2 text-15 text-slate-600">
            {aberta.slots} {aberta.slots === 1 ? "vaga" : "vagas"} · palavra-chave
            <span className="pn-chip normal-case tracking-normal">{aberta.keyword}</span>
          </span>
          <span className="mt-3 block text-13 font-semibold text-cobalt-500">Abrir a oferta</span>
        </Link>
      )}
      {fechadas.map((o) => (
        <Link key={o.id} href="/painel/relampago" className="pn-etiqueta-preco pn-etiqueta-preco--fechada block min-h-[72px]">
          <span className="pn-chip pn-chip--line absolute right-4 top-4">Fechada</span>
          <span className="pn-etiqueta-preco__nome block pr-24 text-[16px]">{o.name}</span>
          <span className="mt-1 block text-13 text-slate-600">
            {o.slots} {o.slots === 1 ? "vaga" : "vagas"} · fechada
          </span>
        </Link>
      ))}
    </div>
  );
}
