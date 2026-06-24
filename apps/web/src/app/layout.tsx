import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HUBFLOW - Broadcast & Gestao de Grupos",
  description: "Plataforma de automacao de grupos e broadcast no WhatsApp.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
