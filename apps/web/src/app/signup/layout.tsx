import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * A página é `"use client"` e um client component NAO pode exportar `metadata`.
 * Sem este layout as cinco rotas de autenticação herdavam o title da home, e o
 * Google via cinco páginas com o mesmo rótulo — inclusive a de criar conta, que é a única das cinco com valor de busca.
 */
export const metadata: Metadata = {
  title: "Criar conta",
  description: "Comece a encher seus grupos de WhatsApp de revendedores e a publicar sua grade em todos de uma vez.",
  alternates: { canonical: "/signup" },
};

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
