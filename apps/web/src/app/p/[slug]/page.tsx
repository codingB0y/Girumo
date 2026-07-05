import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getPublishedPageBySlug } from "@/lib/pages/store";
import { consentText, resolveTargetUrl } from "@/lib/pages/schema";
import { resolveTemplate } from "@/components/pages/templates";
import { TrackingScripts } from "@/components/pages/tracking-scripts";

export const runtime = "nodejs";

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

  return {
    title: `${page.content.headline} · ${page.content.store_name}`,
    description: page.content.description,
    openGraph: {
      title: page.content.headline,
      description: page.content.description,
      images: [{ url: page.content.photo_url }],
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

  const targetUrl = resolveTargetUrl(page);
  if (!targetUrl) notFound(); // published sem destino não existe (CHECK no banco)

  const Template = resolveTemplate(page.component_key);

  return (
    <>
      <Template
        slug={slug}
        content={page.content}
        copy={page.template_copy}
        targetUrl={targetUrl}
        consentText={consentText(page.content.store_name, page.content.group_topic)}
      />
      <TrackingScripts slug={slug} metaPixelId={page.meta_pixel_id} ga4Id={page.ga4_id} />
    </>
  );
}
