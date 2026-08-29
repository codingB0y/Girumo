import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * A página é `"use client"` e um client component NAO pode exportar `metadata`.
 * Sem este layout as cinco rotas de autenticação herdavam o title da home, e o
 * Google via cinco páginas com o mesmo rótulo.
 */
export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse seu painel da Girumo para gerenciar grupos, campanhas e disparos.",
  alternates: { canonical: "/login" },
  // Página utilitária: não responde a nenhuma busca e não deve competir com a
  // home pelo mesmo domínio. `follow: true` porque os links daqui (termos,
  // privacidade) são nossos e legítimos.
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
