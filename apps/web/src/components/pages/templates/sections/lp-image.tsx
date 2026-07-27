/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import type { LpMediaRef } from "@/lib/pages/content";
import { mediaSrc, mediaPosition } from "@/lib/pages/media";

/**
 * Imagem da LP, sempre preenchendo um pai `relative` com dimensões reservadas.
 *
 * Mídia enviada pelo lojista (`media_id`) resolve para /api/p/media/:id, que é
 * same-origin — então o `next/image` gera o DERIVADO (webp/avif + srcset) e o
 * visitante nunca recebe o arquivo bruto (§7.4/§11), sem precisar de allowlist de
 * domínio nem de lib de imagem no projeto.
 *
 * `url` externa (conteúdo legado adaptado e preview de fixture) cai no `<img>`
 * cru de propósito: o domínio é arbitrário e o next/image exigiria remotePatterns.
 */
export function LpImage({
  media,
  alt,
  priority = false,
  sizes = "100vw",
}: {
  media: LpMediaRef;
  alt: string;
  /** true só para a mídia da 1ª dobra (hero): carrega eager com prioridade. */
  priority?: boolean;
  sizes?: string;
}) {
  const src = mediaSrc(media);
  const objectPosition = mediaPosition(media);

  if (media.media_id) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
        style={{ objectPosition }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition }}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
    />
  );
}
