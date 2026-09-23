import type { Metadata } from "next";
import { Lp3Landing } from "@/components/lp3/landing";

/* A home anterior, intacta. A Cartaz+ assumiu "/" em 23/09/2026 e esta versão
   ficou guardada aqui a pedido do Igor. Fora do índice pra não disputar com a
   home. Abre sem sessão sem entrar em PUBLIC_PAGES: o matcher do middleware
   exclui todo caminho que começa com "lp". */
export const metadata: Metadata = {
  title: { absolute: "Girumo — Grupos de WhatsApp pra atacado de roupa" },
  robots: { index: false, follow: true },
  alternates: { canonical: "/lp3" },
};

export default function Lp3Page() {
  return <Lp3Landing />;
}
