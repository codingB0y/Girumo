import type { FaqSection } from "@/lib/pages/sections";
import { SectionHead, Wrap } from "@/components/pages/templates/v3/primitives";
import { SECTION, T } from "@/components/pages/templates/v3/tokens";

/** Perguntas frequentes em `<details>` nativo — acordeão sem JS, acessível por teclado. */
export function Faq({ section }: { section: FaqSection }) {
  const { title, items } = section.data;
  return (
    <section className={`bg-[var(--lp-surface)] ${SECTION}`}>
      <Wrap className="lg:grid lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-4">
          <SectionHead title={title} />
        </div>
        <div className="mt-8 divide-y divide-[color:var(--lp-line)] border-y border-[color:var(--lp-line)] lg:col-span-8 lg:mt-0">
          {items.map((it) => (
            <details key={it.q} className="group py-4 lg:py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[1.05rem] font-semibold text-[color:var(--lp-ink)] [&::-webkit-details-marker]:hidden">
                {it.q}
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[color:var(--lp-line)] text-[color:var(--lp-accent)] transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)] group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className={`mt-3 max-w-prose ${T.body}`}>{it.a}</p>
            </details>
          ))}
        </div>
      </Wrap>
    </section>
  );
}
