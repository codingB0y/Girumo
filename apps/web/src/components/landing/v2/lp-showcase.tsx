"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/landing/icons";
import { BRAND } from "@/lib/brand";

type Template = {
  id: string;
  label: string;
  brand: string;
  headline: string;
  sub: string;
  categories: string[];
  slug: string;
};

const TEMPLATES: Template[] = [
  {
    id: "moda",
    label: "Moda",
    brand: "Lume Atacado",
    headline: "Novidades de atacado primeiro no grupo",
    sub: "Entre para acompanhar lançamentos e condições para revenda.",
    categories: ["Novidades", "Grades", "Reposição"],
    slug: "lume",
  },
  {
    id: "infantil",
    label: "Infantil",
    brand: "Pipa Infantil",
    headline: "Coleções infantis para quem compra para revender",
    sub: "Receba a próxima grade e organize seus pedidos pelo grupo.",
    categories: ["Conjuntos", "Básicos", "Coleções"],
    slug: "pipa",
  },
  {
    id: "calcados",
    label: "Calçados",
    brand: "Norte Calçados",
    headline: "Reposições e lançamentos direto no WhatsApp",
    sub: "Acompanhe modelos, numerações e condições de atacado.",
    categories: ["Lançamentos", "Reposição", "Atacado"],
    slug: "norte",
  },
];

const BULLETS = [
  "Modelos prontos, personalizáveis com a sua marca, cores e fotos",
  "Publicação no endereço configurado, sem contratar hospedagem nem programador",
  "Cada clique segue rastreado desde o anúncio até o grupo",
];

export function LpShowcase({ publicSiteUrl }: { publicSiteUrl: string }) {
  const [active, setActive] = useState(0);
  const template = TEMPLATES[active];
  const publicHost = new URL(publicSiteUrl).host;

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[0.86fr_1.14fr] lg:gap-20">
      <div>
        <h2 className="font-tech text-[clamp(1.9rem,4.5vw,3.2rem)] font-bold leading-[1.05] tracking-tight text-paper-0">
          Uma página clara <span className="text-canvas-100/50">que leva o revendedor ao grupo.</span>
        </h2>
        <p className="mt-5 max-w-md leading-relaxed text-canvas-100/65">
          Escolha um modelo, troque logo, cores e fotos, depois publique. O link registra cada lead do anúncio até a venda.
        </p>
        <ul className="mt-7 space-y-3.5">
          {BULLETS.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3 text-[15px] text-canvas-100/75">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-acid-500" />
              {bullet}
            </li>
          ))}
        </ul>

        <div className="mt-9">
          <p className="font-data text-[10px] uppercase tracking-[0.14em] text-canvas-100/50">troque o modelo demonstrativo</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPLATES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={active === index}
                className={cn(
                  "rounded-[var(--radius-control)] border px-4 py-2 text-sm transition",
                  active === index
                    ? "border-cobalt-500 bg-cobalt-500 font-medium text-paper-0"
                    : "border-volt-800 bg-volt-950 text-canvas-100/65 hover:border-canvas-100/40 hover:text-paper-0",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative pb-4 pr-4">
        <div className="absolute bottom-0 right-0 h-[calc(100%-1rem)] w-[calc(100%-1rem)] bg-acid-500" aria-hidden />
        <article key={template.id} className="hf-enter relative bg-paper-0 p-6 text-volt-950 sm:p-9">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-200 pb-5">
            <div>
              <p className="font-data text-[10px] uppercase tracking-[0.12em] text-slate-600">modelo demonstrativo</p>
              <p className="mt-1 font-tech text-xl font-bold">{template.brand}</p>
            </div>
            <p className="font-data text-[10px] text-cobalt-700">{BRAND.products[0]}</p>
          </div>

          <div className="py-9 sm:py-12">
            <p className="max-w-xl font-tech text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{template.headline}</p>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-600 sm:text-base">{template.sub}</p>
            <div className="mt-7 flex flex-wrap gap-2">
              {template.categories.map((category) => (
                <span key={category} className="border border-line-200 bg-canvas-100 px-3 py-2 font-data text-[10px] uppercase tracking-[0.1em] text-slate-600">
                  {category}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 border-t border-line-200 pt-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <p className="flex min-w-0 items-center gap-2 font-data text-[11px] text-slate-600">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-cobalt-500" />
              <span className="truncate">{publicHost}/p/{template.slug}</span>
            </p>
            <span className="flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-acid-500 px-5 py-3 text-sm font-semibold text-volt-950">
              <WhatsAppIcon className="h-4 w-4" /> Entrar no grupo VIP
            </span>
          </div>
        </article>
      </div>
    </div>
  );
}
