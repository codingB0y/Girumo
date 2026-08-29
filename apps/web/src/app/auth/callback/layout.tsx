import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * A página é `"use client"` e um client component NAO pode exportar `metadata`.
 * Sem este layout as cinco rotas de autenticação herdavam o title da home, e o
 * Google via cinco páginas com o mesmo rótulo.
 */
export const metadata: Metadata = {
  title: "Conectando sua conta",
  description: "Retorno do consentimento do Google. Um instante enquanto concluímos o acesso.",
  alternates: { canonical: "/auth/callback" },
  // Retorno de OAuth: existe por um instante e não é destino de ninguém.
  // `follow: false` também, porque não há nada aqui a rastrear.
  robots: { index: false, follow: false },
};

export default function AuthCallbackLayout({ children }: { children: ReactNode }) {
  return children;
}
