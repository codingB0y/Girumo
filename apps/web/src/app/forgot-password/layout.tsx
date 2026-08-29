import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * A página é `"use client"` e um client component NAO pode exportar `metadata`.
 * Sem este layout as cinco rotas de autenticação herdavam o title da home, e o
 * Google via cinco páginas com o mesmo rótulo.
 */
export const metadata: Metadata = {
  title: "Recuperar senha",
  description: "Receba por e-mail o link para redefinir a senha da sua conta Girumo.",
  alternates: { canonical: "/forgot-password" },
  // Página utilitária: não responde a nenhuma busca e não deve competir com a
  // home pelo mesmo domínio. `follow: true` porque os links daqui (termos,
  // privacidade) são nossos e legítimos.
  robots: { index: false, follow: true },
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
