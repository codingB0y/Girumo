import type { Metadata } from "next";
import { PilotoLanding } from "@/components/lp-piloto/piloto-landing";

/* Landing de anúncio (Modelo 1, linguagem de automação, sem nicho). Fora do
   índice: quem chega aqui vem do anúncio, e a página disputaria busca com a home. */
export const metadata: Metadata = {
  title: { absolute: "Girumo — Seus grupos de WhatsApp no piloto automático" },
  description:
    "A Girumo cria um grupo novo quando o atual lota, posta a mesma mensagem em todos os seus grupos de WhatsApp e mostra de onde veio cada venda.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/automatico" },
};

export default function AutomaticoPage() {
  return <PilotoLanding />;
}
