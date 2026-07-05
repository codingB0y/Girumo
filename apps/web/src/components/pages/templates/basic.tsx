/* eslint-disable @next/next/no-img-element */
import type { TemplateProps } from "@/components/pages/templates";
import { COLOR_STYLES } from "@/components/pages/templates";
import { LeadForm } from "@/components/pages/lead-form";

/**
 * Template básico (usado pelos 3 gatilhos no MVP — decisão do Igor 2026-07-02).
 * Server-rendered, mobile-first; o único JS é o LeadForm + tracking.
 * A foto usa <img> comum de propósito: domínio da imagem é arbitrário
 * (URL do lojista) e next/image exigiria allowlist de remotePatterns.
 */
export function BasicTemplate({ slug, content, copy, consentText, preview }: TemplateProps) {
  const color = COLOR_STYLES[content.primary_color];

  return (
    <main
      className={`dz-rise mx-auto flex w-full max-w-md flex-col justify-center px-5 py-10 lg:max-w-lg ${preview ? "" : "min-h-svh"}`}
    >
      {copy.badge ? (
        <p className={`mx-auto w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest ${color.soft} ${color.text}`}>
          {copy.badge}
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <img
          src={content.photo_url}
          alt={`Foto de ${content.store_name}`}
          className="aspect-video w-full object-cover"
          loading="eager"
        />
        <div className="p-6">
          <p className="text-sm font-medium text-slate-500">{content.store_name}</p>
          <h1 className="mt-2 text-2xl font-bold leading-snug text-slate-900 lg:text-3xl">
            {content.headline}
          </h1>
          <p className="mt-3 leading-relaxed text-slate-600">{content.description}</p>

          <LeadForm
            slug={slug}
            cta={copy.cta ?? "Entrar no grupo"}
            consentText={consentText}
            buttonClass={`${color.bg} ${color.ring}`}
            preview={preview}
          />

          {copy.scarcity_note || copy.rules_note || copy.teaser_note ? (
            <p className="mt-4 text-center text-xs uppercase tracking-wider text-slate-400">
              {copy.scarcity_note ?? copy.rules_note ?? copy.teaser_note}
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        página criada com HubFlow
      </p>
    </main>
  );
}
