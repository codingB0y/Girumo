import type { ScheduleSection } from "@/lib/pages/sections";
import { Pill, SectionHead, Wrap } from "@/components/pages/templates/v3/primitives";
import { SECTION, T } from "@/components/pages/templates/v3/tokens";

/**
 * Programação. Por dia (Semana do Consultório, Yield): etiqueta com o dia; passo
 * a passo: numeração grande, porque aqui a ordem É informação; regras do grupo:
 * a mesma lista, com a etiqueta que o lojista escreveu ("Horário", "Pedido").
 */
export function Schedule({ section }: { section: ScheduleSection }) {
  const { title, items } = section.data;
  const steps = section.variant === "steps";

  return (
    <section className={`bg-[var(--lp-bg)] ${SECTION}`}>
      <Wrap>
        <SectionHead title={title} />
        <ol className="mt-10 divide-y divide-[color:var(--lp-line)] border-y border-[color:var(--lp-line)]">
          {items.map((it, i) => (
            <li key={it.label + it.title} className="grid grid-cols-[auto_1fr] items-start gap-5 py-6 lg:gap-8 lg:py-7">
              {steps ? (
                <span
                  aria-hidden
                  className="[font-family:var(--lp-font-display)] w-12 text-[2rem] font-extrabold leading-none tabular-nums text-[color:var(--lp-accent)] lg:w-16 lg:text-[2.6rem]"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              ) : (
                <span className="pt-0.5">
                  <Pill tone="brand">{it.label}</Pill>
                </span>
              )}
              <div>
                {steps ? <p className={`mb-1 ${T.meta}`}>{it.label}</p> : null}
                <h3 className={`${T.h3} lg:text-[1.35rem]`}>{it.title}</h3>
                {it.description ? <p className={`mt-1.5 max-w-prose ${T.body}`}>{it.description}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </Wrap>
    </section>
  );
}
