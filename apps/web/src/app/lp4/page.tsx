import type { Metadata } from "next";
import { CartazLanding } from "@/components/lp-cartaz/cartaz-landing";

/* A Cartaz+, intacta. Foi a home de 23/09 a 15/10/2026, quando a Vitrine (V4)
   assumiu "/"; ficou guardada aqui a pedido do Igor, como a /lp3 antes dela.
   Fora do índice pra não disputar com a home. Abre sem sessão sem entrar em
   PUBLIC_PAGES: o matcher do middleware exclui todo caminho que começa com "lp". */
export const metadata: Metadata = {
  title: { absolute: "Girumo — Grupos de WhatsApp pra atacado de roupa" },
  robots: { index: false, follow: true },
  alternates: { canonical: "/lp4" },
};

export default function Lp4Page() {
  return <CartazLanding />;
}
