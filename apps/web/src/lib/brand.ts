export const BRAND = {
  name: "Girumo",
  pronunciation: "Gi-ru-mo, com tonicidade em ru",
  tagline: "Mais grupos lotados. Menos trabalho. Mais vendas.",
  functionalLine: "Seus grupos rodando. Você vendendo.",
  description:
    "Capte clientes, organize seus grupos de WhatsApp e deixe campanhas programadas para vender com menos trabalho.",
  emailFooter: "Girumo · Automação para grupos que vendem",
  symbolAsset: "/brand/girumo/svg/girumo-symbol-volt.svg",
  symbolPaperAsset: "/brand/girumo/svg/girumo-symbol-paper.svg",
  symbolCanvasAsset: "/brand/girumo/svg/girumo-symbol-canvas.svg",
  ogAsset: "/brand/girumo/social/og-default-1200x630.png",
  emailLogoAsset: "/brand/girumo/email/girumo-email-lockup-640x160.png",
  products: ["Girumo Pages", "Girumo Grupos", "Girumo Campanhas", "Girumo Agenda", "Girumo Resultados"],
} as const;

export const BRAND_PRODUCTS = BRAND.products;

export const BRAND_COLORS = {
  volt: "#071923",
  volt950: "#071923",
  volt900: "#0C2835",
  volt800: "#123746",
  acid: "#A7FF2F",
  cobalt: "#2E66FF",
  cobalt500: "#2E66FF",
  cobalt700: "#1947C9",
  cobaltText: "#1947C9",
  info: "#1947C9",
  info700: "#1947C9",
  canvas: "#F4F0E7",
  paper: "#FFFEFA",
  slate: "#52646C",
  line: "#D8D7CF",
  success: "#0C7346",
  warning: "#7A4A00",
  danger: "#B82936",
} as const;

export function getPublicSiteUrl(): string {
  // O host canônico é o www: girumo.com.br responde 308 pro www em produção.
  // Declarar o apex fazia toda URL do sitemap ser um redirect e o canonical da
  // home apontar pra uma URL que não é a servida.
  // O trim vem ANTES do corte da barra final e não é decorativo: a env de
  // produção esteve com um TAB no início, e o sitemap saiu com
  // "<loc>\thttps://..." — whitespace inicial num <loc> é URL inválida pelo
  // spec, o que põe o sitemap inteiro em risco de rejeição.
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.girumo.com.br").trim().replace(/\/$/, "");
}

export function getBrandAssetUrl(pathname: string, siteUrl = getPublicSiteUrl()): string {
  return new URL(pathname, `${siteUrl.replace(/\/$/, "")}/`).toString();
}
