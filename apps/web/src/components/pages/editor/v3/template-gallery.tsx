"use client";

/* eslint-disable @next/next/no-img-element */
import { ArrowRight } from "lucide-react";
import { TEMPLATE_LIST, type LpTemplateKey } from "@/lib/pages/templates-v3";

export type GalleryPick = LpTemplateKey;

const DIRECTION_LABEL: Record<string, string> = {
  impacto: "Escura · impacto",
  editorial: "Clara · editorial",
  vitrine: "Vitrine",
};

/**
 * Galeria de modelos (§7.1): miniatura REAL do render mobile, nome, uma linha
 * de descrição, quando usar e "Usar este modelo". A ordem dos cards é a de
 * TEMPLATE_LIST. As miniaturas vivem em /lp-templates/<chave>.jpg, geradas do
 * render; sem a imagem, o card mostra só o fundo.
 */
export function TemplateGallery({ onPick, disabled }: { onPick: (key: GalleryPick) => void; disabled?: boolean }) {
  const cards = TEMPLATE_LIST.map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    usage: t.usage,
    direction: DIRECTION_LABEL[t.direction],
    thumb: `/lp-templates/${t.key}.jpg`,
  }));

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Modelos de página">
      {cards.map((c) => (
        <li key={c.key} className="flex flex-col overflow-hidden rounded-2xl border border-volt-950/[0.08] bg-white shadow-card">
          <div className="relative aspect-[9/14] bg-canvas-100">
            <img
              src={c.thumb}
              alt={`Miniatura do modelo ${c.name} no celular`}
              className="absolute inset-0 h-full w-full object-cover object-top"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.hidden = true;
              }}
            />
          </div>
          <div className="flex flex-1 flex-col p-5">
            <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{c.direction}</p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-[-0.02em] text-volt-950">{c.name}</h2>
            <p className="mt-1 text-sm text-aco/80">{c.description}</p>
            <p className="mt-2 text-xs text-aco/60">{c.usage}</p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(c.key)}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white shadow-brand transition hover:bg-cobalt-500 disabled:opacity-60"
            >
              Usar este modelo <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
