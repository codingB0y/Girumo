"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/landing/icons";

/**
 * Vitrine de modelos de landing page de captação pra grupo.
 * Interativa: trocar o tema re-tematiza a página no frame de celular,
 * mostrando na prática o "personalizável com a sua marca".
 */

type Theme = {
  id: string;
  label: string;
  brand: string;
  accent: string;      /* cor da marca do cliente */
  accentSoft: string;
  headline: string;
  sub: string;
  products: string[];
};

const THEMES: Theme[] = [
  {
    id: "moda",
    label: "Moda",
    brand: "Lume Store",
    accent: "#f472b6",
    accentSoft: "rgba(244, 114, 182, 0.14)",
    headline: "Drops com até 60% OFF antes de todo mundo",
    sub: "Entre no grupo VIP e receba as peças novas primeiro.",
    products: ["👗", "👜", "👟", "🧥"],
  },
  {
    id: "tech",
    label: "Eletrônicos",
    brand: "Volt Imports",
    accent: "#38bdf8",
    accentSoft: "rgba(56, 189, 248, 0.14)",
    headline: "Importados com preço de atacado, todo dia",
    sub: "Ofertas relâmpago exclusivas pra quem tá no grupo.",
    products: ["📱", "🎧", "⌚", "🔌"],
  },
  {
    id: "beleza",
    label: "Beleza",
    brand: "Vela Cosmética",
    accent: "#fbbf24",
    accentSoft: "rgba(251, 191, 36, 0.14)",
    headline: "Kits profissionais com desconto de revenda",
    sub: "Grupo fechado com condições que não vão pro feed.",
    products: ["💄", "🧴", "✨", "🪞"],
  },
];

const BULLETS = [
  "Modelos prontos, personalizáveis com a sua marca, cores e fotos",
  "Publica no nosso domínio — sem contratar hospedagem nem programador",
  "Quem clica já cai no grupo certo, rastreado desde o anúncio",
];

export function LpShowcase() {
  const [active, setActive] = useState(0);
  const t = THEMES[active];

  return (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
      {/* copy */}
      <div>
        <p className="font-data text-xs uppercase tracking-[0.3em] text-bruma/40">páginas de captação</p>
        <h2 className="font-tech mt-4 text-[clamp(1.9rem,4.5vw,3.2rem)] font-bold leading-[1.05] tracking-tight text-white">
          Uma página bonita <span className="text-bruma/45">que lota o grupo por você.</span>
        </h2>
        <p className="mt-5 max-w-md leading-relaxed text-bruma/55">
          Escolha um modelo, troque logo, cores e fotos, publique. O link já nasce
          rastreando cada lead do anúncio até a venda.
        </p>
        <ul className="mt-7 space-y-3.5">
          {BULLETS.map((b) => (
            <li key={b} className="flex items-start gap-3 text-[15px] text-bruma/70">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zap" />
              {b}
            </li>
          ))}
        </ul>

        {/* seletor de tema */}
        <div className="mt-9">
          <p className="font-data text-[10px] uppercase tracking-[0.25em] text-bruma/35">
            experimente com outra marca →
          </p>
          <div className="mt-3 flex gap-2">
            {THEMES.map((theme, i) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={active === i}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
                  active === i
                    ? "border-white/40 bg-white/[0.07] font-medium text-white"
                    : "border-white/10 text-bruma/50 hover:border-white/25 hover:text-white",
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: theme.accent }} />
                {theme.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* phone preview */}
      <div className="mx-auto w-full max-w-[340px]">
        <div className="rounded-[2.6rem] border border-white/15 bg-void-2 p-3 shadow-deep">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.07] bg-[#0a0b12]">
            {/* notch */}
            <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-black/80" />
            {/* página do cliente */}
            <div key={t.id} className="hf-enter px-5 pb-6 pt-12">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm" style={{ background: t.accentSoft }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.accent }} />
                </span>
                <span className="text-sm font-semibold text-white">{t.brand}</span>
              </div>
              <h3 className="font-tech mt-5 text-[1.35rem] font-bold leading-snug tracking-tight text-white">
                {t.headline}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-bruma/50">{t.sub}</p>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {t.products.map((p, i) => (
                  <span
                    key={i}
                    className="flex aspect-square items-center justify-center rounded-xl text-xl"
                    style={{ background: t.accentSoft }}
                  >
                    {p}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-[#25d366] py-3 text-sm font-semibold text-[#04240f]">
                <WhatsAppIcon className="h-4 w-4" /> Entrar no grupo VIP
              </div>
              <p className="font-data mt-2.5 text-center text-[10px] uppercase tracking-wider" style={{ color: t.accent }}>
                🔒 restam 37 vagas nesse grupo
              </p>
              <p className="font-data mt-5 flex items-center justify-center gap-1.5 border-t border-white/[0.07] pt-3 text-[10px] text-bruma/35">
                <Link2 className="h-3 w-3" /> hubflow.com.br/p/{t.id === "moda" ? "lume" : t.id === "tech" ? "volt" : "vela"}
              </p>
            </div>
          </div>
        </div>
        <p className="font-data mt-4 text-center text-[10px] uppercase tracking-[0.25em] text-bruma/35">
          lead rastreado do clique ao grupo
        </p>
      </div>
    </div>
  );
}
