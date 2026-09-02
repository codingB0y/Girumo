import type { DeliverablesSection } from "@/lib/pages/sections";
import { LpImage } from "@/components/pages/templates/sections/lp-image";
import { Card, CheckIcon, SectionHead, Wrap } from "@/components/pages/templates/v3/primitives";
import { SECTION, T } from "@/components/pages/templates/v3/tokens";

/**
 * "O que você recebe". Três variantes, nenhuma com ícone genérico de linha:
 * checklist (Yield), cards com foto (La Lumini) e faixa de números (Mentoria,
 * Srta Executiva). Os itens são paralelos, então não há numeração.
 */
export function Deliverables({ section }: { section: DeliverablesSection }) {
  const { title, items } = section.data;

  if (section.variant === "numbers") {
    return (
      <section className={`bg-[var(--lp-surface)] ${SECTION}`}>
        <Wrap>
          <SectionHead title={title} />
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            {items.map((it) => (
              <div key={it.title} className="border-t border-[color:var(--lp-line)] pt-5">
                <dd className={T.number}>{it.title}</dd>
                {it.description ? <dt className={`mt-2 ${T.meta}`}>{it.description}</dt> : null}
              </div>
            ))}
          </dl>
        </Wrap>
      </section>
    );
  }

  if (section.variant === "photo_cards") {
    return (
      <section className={`bg-[var(--lp-bg)] ${SECTION}`}>
        <Wrap>
          <SectionHead title={title} />
          <ul className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
            {items.map((it) => (
              <li key={it.title}>
                <Card className="h-full overflow-hidden">
                  <div className="relative aspect-[4/5] bg-[var(--lp-surface-2)]">
                    {it.media ? (
                      <LpImage media={it.media} alt={it.media.alt || it.title} sizes="(min-width: 1024px) 30vw, 50vw" />
                    ) : null}
                  </div>
                  <div className="p-4 lg:p-5">
                    <h3 className={T.h3}>{it.title}</h3>
                    {it.description ? <p className={`mt-1.5 ${T.body}`}>{it.description}</p> : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Wrap>
      </section>
    );
  }

  return (
    <section className={`bg-[var(--lp-bg)] ${SECTION}`}>
      <Wrap>
        <SectionHead title={title} />
        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {items.map((it) => (
            <li key={it.title}>
              <Card className="flex h-full items-start gap-3.5 p-4 lg:p-5">
                <CheckIcon className="mt-0.5 h-6 w-6 shrink-0" />
                <div>
                  <p className="font-semibold text-[color:var(--lp-ink)]">{it.title}</p>
                  {it.description ? <p className={`mt-1 ${T.body}`}>{it.description}</p> : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}
