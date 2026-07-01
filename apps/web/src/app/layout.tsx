import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Instrument_Serif,
} from "next/font/google";
import "./globals.css";
import { ImpersonateBanner } from "@/components/impersonate-banner";

// Direção B / Corrente — display, corpo, dados e respiro editorial.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HubFlow — O fluxo que vende",
    template: "%s | HubFlow",
  },
  description:
    "Gerencie e venda em todos os seus grupos de WhatsApp — num clique só.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`h-full antialiased ${bricolage.variable} ${plexSans.variable} ${plexMono.variable} ${instrument.variable}`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ImpersonateBanner />
      </body>
    </html>
  );
}
