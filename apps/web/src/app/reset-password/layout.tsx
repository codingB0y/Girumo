import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * A página é `"use client"` e um client component NAO pode exportar `metadata`.
 * Sem este layout as cinco rotas de autenticação herdavam o title da home, e o
 * Google via cinco páginas com o mesmo rótulo.
 */
export const metadata: Metadata = {
  title: "Definir nova senha",
  description: "Escolha uma nova senha para a sua conta Girumo.",
  alternates: { canonical: "/reset-password" },
  // Página utilitária: não responde a nenhuma busca e não deve competir com a
  // home pelo mesmo domínio. `follow: true` porque os links daqui (termos,
  // privacidade) são nossos e legítimos.
  robots: { index: false, follow: true },
};

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
