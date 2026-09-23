import type { Metadata } from "next";
import { PilotoLanding } from "@/components/lp-piloto/piloto-landing";
import { BRAND } from "@/lib/brand";

const TITULO = "Girumo — Seus grupos de WhatsApp no piloto automático";
const DESCRICAO =
  "A Girumo cria um grupo novo quando o atual lota, posta a mesma mensagem em todos os seus grupos de WhatsApp e mostra de onde veio cada venda.";

/* Landing de anúncio (Modelo 1, linguagem de automação, sem nicho). Fora do
   índice: quem chega aqui vem do anúncio, e a página disputaria busca com a home.
   openGraph inteiro aqui: o da página substitui o do layout (não mescla), e o
   link compartilhado no WhatsApp mostraria o título da marca, não o da página. */
export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRICAO,
  robots: { index: false, follow: true },
  alternates: { canonical: "/automatico" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: BRAND.name,
    url: "/automatico",
    title: TITULO,
    description: DESCRICAO,
    images: [BRAND.ogAsset],
  },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRICAO, images: [BRAND.ogAsset] },
};

export default function AutomaticoPage() {
  return <PilotoLanding />;
}
