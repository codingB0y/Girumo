import type { GallerySection } from "@/lib/pages/sections";
import { LpImage } from "@/components/pages/templates/sections/lp-image";
import { SectionHead, Wrap } from "@/components/pages/templates/v3/primitives";
import { SECTION, T } from "@/components/pages/templates/v3/tokens";

/**
 * Galeria de peças (variante `grid`): 2–6 fotos em retrato 3:4, duas colunas no
 * celular e três no desktop, legenda = `alt`. Herda a galeria da editorial v2
 * (arara e look): é a seção que faz a pessoa ver o produto antes de deixar o
 * número. Masonry e carrossel com preço vêm com a direção `vitrine` (Fase 3).
 */
export function Gallery({ section }: { section: GallerySection }) {
  const { title, items } = section.data;

  return (
    <section className={`bg-[var(--lp-bg)] ${SECTION}`}>
      <Wrap>
        <SectionHead title={title} />
        <ul className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5">
          {items.map((m, i) => (
            <li key={m.media_id ?? m.url ?? i}>
              <figure>
                <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-[color:var(--lp-line)] bg-[var(--lp-surface)]">
                  <LpImage media={m} alt={m.alt || `Peça ${i + 1}`} sizes="(min-width: 1024px) 30vw, 50vw" />
                </div>
                {m.alt ? <figcaption className={`mt-2 ${T.meta}`}>{m.alt}</figcaption> : null}
              </figure>
            </li>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}
