import type { Metadata } from "next";
import { AtacadoLanding } from "@/components/lp-atacado/atacado-landing";

/* Landing de anúncio (Modelo 2, atacado da 44 e do Brás). Fora do índice: quem
   chega aqui vem do anúncio. Quem digita "/44ebras" em minúscula é levado pra cá
   pelo middleware (publicPageCaseAlias, em lib/public-pages.ts). */
export const metadata: Metadata = {
  title: { absolute: "Girumo — Grupos de WhatsApp pro atacado da 44 e do Brás" },
  description:
    "Lançamento de coleção, promoções e novidades em todos os seus grupos de WhatsApp de uma vez. Feita pela Mega Stock, atacado infantil da região da 44.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/44eBras" },
};

export default function AtacadoPage() {
  return <AtacadoLanding />;
}
