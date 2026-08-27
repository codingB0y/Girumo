import { Lp3Landing, LP3_FAQ } from "@/components/lp3/landing";
import { BRAND, getPublicSiteUrl } from "@/lib/brand";

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
  },
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_SOFTWARE) }} />
      <Lp3Landing />
    </>
  );
}
