import type { UrgencySection } from "@/lib/pages/sections";
import { Countdown } from "@/components/pages/templates/v3/sections/countdown";
import { Wrap } from "@/components/pages/templates/v3/primitives";

/**
 * Data e urgência. `top_bar` é renderizada pela estrutura ACIMA do hero (barra
 * fina na cor da marca, como no ONM ao Vivo); `date_badge` e `countdown` entram
 * na posição da seção como uma faixa curta colada ao hero.
 */
export function UrgencyTopBar({ section }: { section: UrgencySection }) {
  const { label, note } = section.data;
  return (
    <div className="bg-[var(--lp-brand)] text-[color:var(--lp-on-brand)]">
      <Wrap className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2.5 text-center text-sm font-semibold">
        <span>{label}</span>
        {note ? <span className="font-normal opacity-80">{note}</span> : null}
      </Wrap>
    </div>
  );
}

export function UrgencyBand({ section }: { section: UrgencySection }) {
  const { label, note, ends_at } = section.data;
  const countdown = section.variant === "countdown" && ends_at;

  return (
    <section className="border-y border-[color:var(--lp-line)] bg-[var(--lp-surface)]">
      <Wrap className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between lg:py-7">
        <div className="flex items-start gap-3">
          <svg viewBox="0 0 20 20" fill="none" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden>
            <rect x="3" y="4" width="14" height="13" rx="2" className="stroke-[var(--lp-accent)]" strokeWidth="1.5" />
            <path d="M3 8h14M7 2v4M13 2v4" className="stroke-[var(--lp-accent)]" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-base font-semibold text-[color:var(--lp-ink)] lg:text-lg">{label}</p>
            {note ? <p className="mt-0.5 text-sm text-[color:var(--lp-muted)]">{note}</p> : null}
          </div>
        </div>
        {countdown ? <Countdown endsAt={ends_at} /> : null}
      </Wrap>
    </section>
  );
}
