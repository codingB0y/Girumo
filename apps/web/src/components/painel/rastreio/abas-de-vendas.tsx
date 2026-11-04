import Link from "next/link";
import React from "react";

const ABAS = [
  { chave: "registrar", href: "/painel/vendas", texto: "Registrar venda" },
  { chave: "entregas", href: "/painel/vendas/entregas", texto: "Entregas" },
] as const;

/** Abas de Vendas: só aparecem com o Rastreio liberado (senão Vendas é uma página só). */
export function AbasDeVendas({ ativa, visivel }: { ativa: "registrar" | "entregas"; visivel: boolean }) {
  if (!visivel) return null;
  return (
    <nav aria-label="Abas de Vendas" className="flex gap-2">
      {ABAS.map((a) => (
        <Link key={a.chave} href={a.href} className="pn-chip" aria-current={a.chave === ativa ? "page" : undefined}>
          {a.texto}
        </Link>
      ))}
    </nav>
  );
}
