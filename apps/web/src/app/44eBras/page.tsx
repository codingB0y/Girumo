import type { Metadata } from "next";
import { AtacadoLanding } from "@/components/lp-atacado/atacado-landing";
import { BRAND } from "@/lib/brand";

const TITULO = "Girumo — Grupos de WhatsApp pro atacado da 44 e do Brás";
const DESCRICAO =
  "Lançamento de coleção, promoções e novidades em todos os seus grupos de WhatsApp de uma vez. Feita pela Mega Stock, atacado infantil da região da 44.";

/* Landing de anúncio (Modelo 2, atacado da 44 e do Brás). Fora do índice: quem
   chega aqui vem do anúncio. Quem digita "/44ebras" em minúscula é levado pra cá
   pelo middleware (publicPageCaseAlias, em lib/public-pages.ts). openGraph
   inteiro aqui: o da página substitui o do layout (não mescla). */
export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRICAO,
  robots: { index: false, follow: true },
  alternates: { canonical: "/44eBras" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: BRAND.name,
    url: "/44eBras",
    title: TITULO,
    description: DESCRICAO,
    images: [BRAND.ogAsset],
  },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRICAO, images: [BRAND.ogAsset] },
};

export default function AtacadoPage() {
  return <AtacadoLanding />;
}
