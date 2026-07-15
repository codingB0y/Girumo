/* eslint-disable @next/next/no-img-element */
import { Logo } from "@/components/brand/logo";
import { LeadForm } from "@/components/pages/lead-form";
import type { TemplateProps } from "@/components/pages/templates";
import { COLOR_STYLES } from "@/components/pages/templates";
import { BRAND } from "@/lib/brand";

/**
 * Template básico usado pelos três gatilhos do MVP.
 * Server-rendered e mobile-first; o único JS é o LeadForm + tracking.
 * A foto continua em <img> porque a URL é fornecida pelo lojista.
 */
export function BasicTemplate({ slug, content, copy, consentText, preview }: TemplateProps) {
  const color = COLOR_STYLES[content.primary_color];

  return (
    <main
      className={`dz-rise mx-auto flex w-full max-w-md flex-col justify-center bg-canvas-100 px-5 py-10 font-body text-volt-950 lg:max-w-lg ${preview ? "" : "min-h-svh"}`}
    >
      <div className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-line-200 bg-paper-0 shadow-card">
        <img
          src={content.photo_url}
          alt={`Foto de ${content.store_name}`}
          className="aspect-video w-full object-cover"
          loading="eager"
        />
        <div className="p-6">
          <p className="font-data text-xs font-medium uppercase tracking-[0.1em] text-slate-600">
            {content.store_name}
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold leading-snug text-volt-950 lg:text-3xl">
            {content.headline}
          </h1>
          <p className="mt-3 leading-relaxed text-slate-600">{content.description}</p>

          <LeadForm
            slug={slug}
            cta={copy.cta ?? "Entrar no grupo"}
            consentText={consentText}
            buttonClass={`${color.button} ${color.ring}`}
            preview={preview}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-slate-600">
        <span className="text-xs">Página criada com {BRAND.name}</span>
        <Logo className="text-sm text-volt-950" title={null} />
      </div>
    </main>
  );
}
