import type { ProofSection } from "@/lib/pages/sections";
import { LpImage } from "@/components/pages/templates/sections/lp-image";
import { Card, Pill, SectionHead, Wrap } from "@/components/pages/templates/v3/primitives";
import { SECTION, T } from "@/components/pages/templates/v3/tokens";

/**
 * Prova social. Prints de WhatsApp (Aline Portela, Jornada Digital): cada print
 * numa moldura 9:16 com o selo "print enviado pela loja" — a prova é do
 * lojista, e a página diz isso. Cards (ONM): aspas grandes, frase, quem disse.
 */
export function Proof({ section }: { section: ProofSection }) {
  const { title, prints, cards } = section.data;

  if (section.variant === "prints") {
    return (
      <section className={`bg-[var(--lp-bg)] ${SECTION}`}>
        <Wrap>
          <SectionHead title={title} />
          <ul className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
            {prints.map((p, i) => (
              <li key={p.media_id ?? p.url ?? i}>
                <figure>
                  <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-[color:var(--lp-line)] bg-[var(--lp-surface)]">
                    <LpImage media={p} alt={p.alt || `Print de conversa ${i + 1}`} sizes="(min-width: 1024px) 30vw, 50vw" />
                  </div>
                  <figcaption className="mt-2.5">
                    <Pill>print enviado pela loja</Pill>
                  </figcaption>
                </figure>
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
        <ul className="mt-10 grid gap-4 lg:grid-cols-3 lg:gap-6">
          {cards.map((c) => (
            <li key={c.name + c.quote}>
              <Card className="flex h-full flex-col p-6 lg:p-7">
                <span
                  aria-hidden
                  className="[font-family:var(--lp-font-display)] text-[3rem] font-extrabold leading-none text-[color:var(--lp-accent)]"
                >
                  &ldquo;
                </span>
                <blockquote className="mt-1 flex-1 text-[1.05rem] leading-relaxed text-[color:var(--lp-ink)]">
                  {c.quote}
                </blockquote>
                <footer className="mt-5 border-t border-[color:var(--lp-line)] pt-4">
                  <p className="font-semibold text-[color:var(--lp-ink)]">{c.name}</p>
                  {c.detail ? <p className={`mt-0.5 ${T.body}`}>{c.detail}</p> : null}
                </footer>
              </Card>
            </li>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}
