import { notFound } from "next/navigation";
import { ConversionEditorial } from "@/components/pages/templates/structures/conversion-editorial";
import { derivePalette } from "@/lib/pages/palette";
import type { LpContentV2 } from "@/lib/pages/content";

/**
 * Fixture DEV-ONLY (§ decisão C2 da Fase 2): renderiza a estrutura editorial v2
 * com o conteúdo do modelo de referência (Lume Atacado) para inspeção visual
 * (mobile/desktop) e screenshots. Guardada por `NODE_ENV` — 404 em produção. Fica
 * em `/lp-preview` (não em `/dev/...`) de propósito: o matcher do middleware libera
 * o prefixo `lp`, então a rota é alcançável sem sessão em desenvolvimento. NÃO
 * substitui o E2E real (Fase 3+ com editor). Imagens são SVG data-URI para
 * renderizar sem rede/CSP — no modelo real são fotos de moda.
 */
export const dynamic = "force-dynamic";

function svg(w: number, h: number, label: string, bg = "#ddd0be", fg = "#8d7f6d"): string {
  const body = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' fill='${fg}' font-family='Georgia, serif' font-size='${Math.round(w / 14)}' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(body)}`;
}

const MOCK: LpContentV2 = {
  schema_version: 2,
  store_name: "Lume",
  brand_color: "#6d2436",
  badge: "Atacado",
  headline: "Lançamentos e preços de atacado primeiro no grupo",
  description: "Veja novidades, reposições e condições exclusivas da Lume antes de todo mundo.",
  cta: "Quero entrar no grupo",
  logo: null,
  hero: { url: svg(900, 1200, "Arara e look"), alt: "Arara de peças e look da coleção Lume" },
  benefits: [
    { title: "Preços de atacado", description: "direto do fabricante" },
    { title: "Novidades toda semana", description: "coleção sempre atualizada" },
    { title: "Pedido mínimo acessível", description: "mais giro, mais lucro" },
  ],
  gallery: [
    { url: svg(600, 800, "Peça 1"), alt: "Vestido midi acinturado" },
    { url: svg(600, 800, "Peça 2"), alt: "Conjunto de linho" },
    { url: svg(600, 800, "Peça 3"), alt: "Vestido estampado" },
  ],
  proof: {
    kind: "video",
    video: {
      provider: "vimeo",
      id: "1207228037",
      poster: { url: svg(600, 750, "Depoimento", "#cbbca8", "#6f6558"), alt: "" },
    },
    name: "Mariana Alves",
    store: "Boutique MA",
    city: "Goiânia",
    quote: "As peças têm ótima saída e o atendimento é sempre rápido.",
  },
};

export default function LpPreviewFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  const palette = derivePalette(MOCK.brand_color) ?? notFound();
  return <ConversionEditorial slug="dev-preview" content={MOCK} palette={palette} />;
}
