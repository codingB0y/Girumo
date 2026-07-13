import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { ImpersonateBanner } from "@/components/impersonate-banner";
import { DevModeBanner } from "@/components/dev-mode-banner";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
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
