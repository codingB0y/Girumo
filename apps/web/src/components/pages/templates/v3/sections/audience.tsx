import type { AudienceSection } from "@/lib/pages/sections";
import { Card, CheckIcon, CrossIcon, SectionHead, Wrap } from "@/components/pages/templates/v3/primitives";
import { SECTION, T } from "@/components/pages/templates/v3/tokens";

/**
 * "Para quem é". Cards de dor (Método IP: uma frase por card, duas colunas) ou
 * as duas listas "é pra você / não é pra você" (Bettina).
 */
export function Audience({ section }: { section: AudienceSection }) {
  const { title, items, not_items } = section.data;

  if (section.variant === "for_not_for") {
    return (
      <section className={`bg-[var(--lp-surface)] ${SECTION}`}>
        <Wrap>
          <SectionHead title={title} />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Card className="p-6 lg:p-7">
              <p className={T.eyebrow}>É pra você se</p>
              <ul className="mt-4 space-y-3.5">
                {items.map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <CheckIcon className="mt-0.5 h-5 w-5 shrink-0" />
                    <span className="text-[color:var(--lp-ink)]">{t}</span>
                  </li>
                ))}
              </ul>
            </Card>
            {not_items && not_items.length > 0 ? (
              <Card className="p-6 lg:p-7">
                <p className={`${T.eyebrow} !text-[color:var(--lp-muted)]`}>Não é pra você se</p>
                <ul className="mt-4 space-y-3.5">
                  {not_items.map((t) => (
                    <li key={t} className="flex items-start gap-3">
                      <CrossIcon className="mt-0.5 h-5 w-5 shrink-0" />
                      <span className="text-[color:var(--lp-muted)]">{t}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </Wrap>
      </section>
    );
  }

  return (
    <section className={`bg-[var(--lp-surface)] ${SECTION}`}>
      <Wrap>
        <SectionHead title={title} />
        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {items.map((t) => (
            <li key={t}>
              <Card className="flex h-full items-start gap-3.5 p-5">
                <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--lp-accent)]" />
                <p className="text-[1.02rem] leading-relaxed text-[color:var(--lp-ink)]">{t}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}
