import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getPublishedPageBySlug } from "@/lib/pages/store";
import type { ReactNode } from "react";
import { consentText, resolveTargetUrl } from "@/lib/pages/schema";
import { isLpContentV2 } from "@/lib/pages/render";
import { derivePalette, type AccessiblePalette } from "@/lib/pages/palette";
import { mediaSrc } from "@/lib/pages/media";
import { resolveTemplate, resolveStructure } from "@/components/pages/templates";
import { TrackingScripts } from "@/components/pages/tracking-scripts";

export const runtime = "nodejs";

/** Paleta de segurança se brand_color for inválido (não deve ocorrer em v2 publicado). */
const FALLBACK_PALETTE: AccessiblePalette = {
  brand: "#6e2233",
  accent: "#6e2233",
  onBrand: "#ffffff",
  adjusted: false,
  reason: null,
};

const SLUG_RE = /^[a-z0-9-]{3,60}$/;

/**
 * Cache ISR por slug com tag — o publish/edit no painel chama
 * revalidateTag(`lp:${slug}`) e a mudança reflete em segundos.
 * revalidate 300s cobre mudanças feitas fora do fluxo normal.
 */
function getCachedPage(slug: string) {
  return unstable_cache(
    () => getPublishedPageBySlug(slug),
    ["lp-public", slug],
    { tags: [`lp:${slug}`], revalidate: 300 },
  )();
}

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return { title: "Página não encontrada" };

  const page = await getCachedPage(slug);
  if (!page) return { title: "Página não encontrada" };

  const content = page.content;
  const ogImage = isLpContentV2(content) ? mediaSrc(content.hero) : content.photo_url;

  return {
    title: `${content.headline} · ${content.store_name}`,
    description: content.description,
    openGraph: {
      title: content.headline,
      description: content.description,
      images: [{ url: ogImage }],
      locale: "pt_BR",
      type: "website",
    },
    robots: { index: true, follow: false },
  };
}

export default async function PublicLandingPage({ params }: PageProps) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();

  const page = await getCachedPage(slug);
  if (!page) notFound();

  // Guarda de integridade (server-only, não vaza no HTML): página publicada sem
  // destino não existe. O destino NUNCA vai pro client — só o POST /api/p/lead o
  // resolve e devolve como redirect_url após a captura bem-sucedida.
  if (!resolveTargetUrl(page)) notFound();

  const content = page.content;
  let body: ReactNode;
  if (isLpContentV2(content)) {
    // Conteúdo v2 → estrutura editorial; paleta acessível derivada da marca.
    const Structure = resolveStructure();
    const palette = derivePalette(content.brand_color) ?? FALLBACK_PALETTE;
    body = <Structure slug={slug} content={content} palette={palette} />;
  } else {
    // Conteúdo legado → BasicTemplate (fallback), sem targetUrl no contrato.
    const Template = resolveTemplate(page.component_key);
    body = (
      <Template
        slug={slug}
        content={content}
        copy={page.template_copy}
        consentText={consentText(content.store_name, content.group_topic)}
      />
    );
  }

  return (
    <>
      {body}
      <TrackingScripts slug={slug} metaPixelId={page.meta_pixel_id} ga4Id={page.ga4_id} />
    </>
  );
}
