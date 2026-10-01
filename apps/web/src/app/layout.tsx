import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ImpersonateBanner } from "@/components/impersonate-banner";
import { DevModeBanner } from "@/components/dev-mode-banner";
import { BRAND, getPublicSiteUrl } from "@/lib/brand";

// Fontes versionadas em src/fonts (subset latin, os mesmos bytes que o Google
// servia): o build não depende mais da rede. Ver src/fonts/README.md.
const manrope = localFont({
  src: "../fonts/manrope/manrope-latin.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-manrope",
  display: "swap",
});

// Um arquivo variável, declarado uma vez por peso: espelha o CSS que o Google gerava.
const plexSans = localFont({
  src: [
    { path: "../fonts/ibm-plex-sans/ibm-plex-sans-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-sans/ibm-plex-sans-latin.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-sans/ibm-plex-sans-latin.woff2", weight: "600", style: "normal" },
  ],
  declarations: [{ prop: "font-stretch", value: "100%" }],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono/ibm-plex-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getPublicSiteUrl()),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    images: [BRAND.ogAsset],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    images: [BRAND.ogAsset],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${manrope.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <DevModeBanner />
        {children}
        <ImpersonateBanner />
      </body>
    </html>
  );
}
