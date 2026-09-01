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
  // Virou página de aplicação na separação de domínios (01/09/2026): www/signup
  // responde 308 para app/signup, porque a sessão criada aqui é host-only. Sem
  // o noindex, o Google seguiria indexando a URL de www que só redireciona, e a
  // versão de app duplicaria o mesmo conteúdo num segundo host.
  robots: { index: false, follow: true },
};

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
