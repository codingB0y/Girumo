import type { Metadata } from "next";
import { ProdutoLanding } from "@/components/home-produto/produto-landing";

/* A segunda direção da home (V3, "Produto"), aprovada junto com a Vitrine em
   15/10/2026 e guardada aqui a pedido do Igor. Fora do índice pra não disputar
   com "/". Abre sem sessão porque está em PUBLIC_PAGES (lib/public-pages.ts). */
export const metadata: Metadata = {
  title: { absolute: "Girumo — Encha os grupos, poste em todos e veja de onde veio cada venda" },
  robots: { index: false, follow: true },
  alternates: { canonical: "/page2" },
};

export default function Page2() {
  return <ProdutoLanding />;
}
