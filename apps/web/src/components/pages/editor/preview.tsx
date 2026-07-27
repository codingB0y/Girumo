"use client";

import type { EditorValues } from "@/components/pages/editor/form";
import { BasicTemplate } from "@/components/pages/templates/basic";
import { getPublicSiteUrl } from "@/lib/brand";
import { consentText } from "@/lib/pages/schema";

/** Foto neutra enquanto o lojista não colou a URL. */
const PLACEHOLDER_PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='%23F4F0E7'/%3E%3Cpath d='M0 300L200 140L330 250L470 110L640 280V360H0Z' fill='%23D8D7CF'/%3E%3Ctext x='320' y='70' text-anchor='middle' font-family='sans-serif' font-size='18' fill='%2352646C'%3ESua foto aparece aqui%3C/text%3E%3C/svg%3E";

const PUBLIC_SITE_LABEL = getPublicSiteUrl().replace(/^https?:\/\//, "");

/**
 * Preview ao vivo do editor: renderiza o mesmo componente da página pública,
 * com o formulário desabilitado e fallbacks para os campos ainda vazios.
 */
export function EditorPreview({
  values,
  copy,
}: {
  values: EditorValues;
  copy: Record<string, string>;
}) {
  const content = {
    store_name: values.store_name || "Sua loja",
    photo_url: /^https:\/\/\S+$/i.test(values.photo_url) ? values.photo_url : PLACEHOLDER_PHOTO,
    headline: values.headline || copy.headline || "Sua headline aparece aqui",
    description: values.description || copy.description || "Sua descrição aparece aqui.",
    group_topic: values.group_topic || "ofertas da loja",
    primary_color: values.primary_color,
  };

  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line-200 bg-canvas-100">
      <div className="flex items-center gap-1.5 border-b border-line-200 bg-volt-950 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-[3px] bg-acid-500" />
        <span className="h-2.5 w-2.5 rounded-[3px] bg-cobalt-500" />
        <span className="h-2.5 w-2.5 rounded-[3px] bg-paper-0/35" />
        <span className="ml-2 truncate font-data text-[11px] text-canvas-100/70">
          {PUBLIC_SITE_LABEL}/p/{values.store_name ? "sua-pagina" : "..."}
        </span>
      </div>
      <div className="max-h-[70vh] overflow-y-auto py-2">
        <BasicTemplate
          slug="preview"
          content={content}
          copy={copy}
          consentText={consentText(content.store_name, content.group_topic)}
          preview
        />
      </div>
    </div>
  );
}
