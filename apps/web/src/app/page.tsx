import { Lp3Landing, LP3_FAQ } from "@/components/lp3/landing";
import { BRAND, getBrandAssetUrl, getPublicSiteUrl } from "@/lib/brand";

/* ============================== SEO ============================== */

const SITE_URL = getPublicSiteUrl();
const PAGE_TITLE = "Girumo — Grupos de WhatsApp pra atacado de roupa";
const OG_TITLE = `${BRAND.name} | ${BRAND.tagline}`;
const OG_DESC = BRAND.description;

const JSON_LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: LP3_FAQ.map(([q, a]) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

const JSON_LD_SOFTWARE = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: BRAND.name,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: OG_DESC,
  url: SITE_URL,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "BRL",
    lowPrice: "127",
    highPrice: "497",
    // Essencial, Growth e Operação (ver PLANS em lp3/landing-data.ts). Sem este
    // campo o AggregateOffer fica incompleto e o Google costuma descartar o
    // bloco inteiro em vez de exibir a faixa de preço.
    offerCount: "3",
  },
};

/**
 * Entidade da marca. Fica AQUI e não no root layout de propósito: o root
 * envolve todas as rotas, inclusive `/p/[slug]` — as landing pages dos
 * LOJISTAS. Declarar ali faria cada página de outra marca afirmar que a
 * organização dona do conteúdo é a Girumo. A home é onde o Google ancora a
 * entidade de um site, então é onde ela pertence.
 *
 * Sem `sameAs`: não há perfil de rede social declarado no contrato de marca, e
 * inventar URL de perfil em dado estruturado é pior que omitir o campo.
 */
const JSON_LD_ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BRAND.name,
  url: SITE_URL,
  logo: getBrandAssetUrl(BRAND.symbolAsset),
  description: OG_DESC,
};

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: PAGE_TITLE },
  description: OG_DESC,
  keywords: [
    "encher grupos de WhatsApp",
    "link para grupo de WhatsApp",
    "gestão de grupos de WhatsApp",
    "publicação em massa WhatsApp",
    "automação de WhatsApp",
    "agendar mensagens WhatsApp",
    "captação de leads WhatsApp",
    "landing page para grupo de WhatsApp",
    "atacado de roupa WhatsApp",
    "vender no WhatsApp",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: BRAND.name,
    title: OG_TITLE,
    description: OG_DESC,
    images: [
      {
        url: BRAND.ogAsset,
        width: 1200,
        height: 630,
        alt: `${BRAND.name}. ${BRAND.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESC,
    images: [BRAND.ogAsset],
  },
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_ORGANIZATION) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_SOFTWARE) }} />
      <Lp3Landing />
    </>
  );
}
