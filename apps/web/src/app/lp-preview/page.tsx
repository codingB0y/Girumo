import { notFound } from "next/navigation";
import { ConversionEditorial } from "@/components/pages/templates/structures/conversion-editorial";
import { derivePalette } from "@/lib/pages/palette";
import type { LpContentV2 } from "@/lib/pages/content";

/**
 * Fixture DEV-ONLY (§ decisão C2 da Fase 2): renderiza a estrutura editorial v2
 * com conteúdo mock para inspeção visual (mobile/desktop) e screenshots. Guardada
 * por `NODE_ENV` — 404 em produção. Fica em `/lp-preview` (não em `/dev/...`) de
 * propósito: o matcher do middleware libera o prefixo `lp`, então a rota é
 * alcançável sem sessão em desenvolvimento. NÃO substitui o E2E real (Fase 3+ com
 * editor). Imagens são SVG data-URI para renderizar sem rede/CSP.
 */
export const dynamic = "force-dynamic";

function svg(w: number, h: number, label: string, bg = "#e7ded2", fg = "#8a7f70"): string {
  const body = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' fill='${fg}' font-family='Georgia, serif' font-size='${Math.round(w / 14)}' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(body)}`;
}

const MOCK: LpContentV2 = {
  schema_version: 2,
  store_name: "Mega Stock Atacado",
  brand_color: "#7b2d3b",
  badge: "Acesso VIP",
  headline: "As ofertas do atacado saem primeiro no grupo",
  description:
    "Peças novas, preço de atacado e o aviso do próximo bazar — tudo antes de todo mundo, direto no seu WhatsApp.",
  cta: "Quero entrar no grupo",
  logo: null,
  hero: { url: svg(800, 1000, "Bazar cheio"), alt: "Loja cheia durante o bazar avisado no grupo" },
  benefits: [
    { title: "Preço de atacado real", description: "Sem intermediário: o mesmo preço que a loja paga na fonte." },
    { title: "Novidade primeiro", description: "Cada drop é avisado no grupo antes de ir pra vitrine." },
    { title: "Bazar só pra VIP", description: "Data e endereço do próximo bazar saem só aqui." },
  ],
  gallery: [
    { url: svg(600, 600, "Peça 1"), alt: "Vestido infantil estampado" },
    { url: svg(600, 600, "Peça 2"), alt: "Conjunto de moletom" },
    { url: svg(600, 600, "Peça 3"), alt: "Camisa jeans" },
    { url: svg(600, 600, "Peça 4"), alt: "Kit body de bebê" },
    { url: svg(600, 600, "Peça 5"), alt: "Vestido de festa" },
    { url: svg(600, 600, "Peça 6"), alt: "Jaqueta de inverno" },
  ],
  proof: {
    kind: "video",
    video: {
      provider: "vimeo",
      id: "1207228037",
      poster: { url: svg(720, 1280, "Depoimento", "#2a2320", "#c9b8a8"), alt: "" },
    },
    name: "Cláudia",
    store: "Cláudia Modas",
    city: "Fortaleza — CE",
    quote: "Comecei sacoleira. Hoje o grupo é onde eu vendo mais rápido.",
  },
};

export default function LpPreviewFixture() {
  if (process.env.NODE_ENV === "production") notFound();
  const palette = derivePalette(MOCK.brand_color) ?? notFound();
  return <ConversionEditorial slug="dev-preview" content={MOCK} palette={palette} />;
}
