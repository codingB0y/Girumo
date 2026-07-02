"use client";

import { BasicTemplate } from "@/components/pages/templates/basic";
import { consentText } from "@/lib/pages/schema";
import type { EditorValues } from "@/components/pages/editor/form";

/** Foto neutra enquanto o lojista não colou a URL. */
const PLACEHOLDER_PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='%23e2e8f0'/%3E%3Ctext x='320' y='188' text-anchor='middle' font-family='sans-serif' font-size='18' fill='%2394a3b8'%3ESua foto aparece aqui%3C/text%3E%3C/svg%3E";

/**
 * Preview ao vivo do editor — renderiza o MESMO componente da LP pública
 * (preview=true desabilita o form), com fallbacks pros campos vazios.
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
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="ml-2 truncate font-mono text-[11px] text-slate-400">
          hubflow.com.br/p/{values.store_name ? "sua-pagina" : "..."}
        </span>
      </div>
      <div className="max-h-[70vh] overflow-y-auto py-2">
        <BasicTemplate
          slug="preview"
          content={content}
          copy={copy}
          targetUrl="#"
          consentText={consentText(content.store_name, content.group_topic)}
          preview
        />
      </div>
    </div>
  );
}
