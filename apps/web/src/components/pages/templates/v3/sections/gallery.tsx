import type { GalleryItem, GallerySection } from "@/lib/pages/sections";
import { LpImage } from "@/components/pages/templates/sections/lp-image";
import { SectionHead, Wrap } from "@/components/pages/templates/v3/primitives";
import { SECTION, T } from "@/components/pages/templates/v3/tokens";

/**
 * Galeria de peças. Três variantes, mesmos dados:
 *
 * - `grid`     — 2–6 fotos em retrato 3:4, herdada da editorial v2 (arara e look).
 * - `masonry`  — mosaico em colunas CSS. As proporções são fixas e ciclam (3:4,
 *                1:1, 4:5) em vez de virem do arquivo: `LpImage` desenha com
 *                `fill`, então o pai precisa reservar altura, e o tamanho real da
 *                foto só existiria depois do download. Ciclar dá o desalinho do
 *                mosaico sem CLS e sem ler dimensão nenhuma.
 * - `carousel` — trilho horizontal com scroll-snap, um cartão por peça.
 *
 * O preço é etiqueta livre por foto e aparece em qualquer variante quando o
 * lojista preenche — quem só quer mostrar a arara deixa em branco.
 */
export function Gallery({ section }: { section: GallerySection }) {
  const { title, items } = section.data;
  const { variant } = section;

  return (
    <section className={`bg-[var(--lp-bg)] ${SECTION}`}>
      <Wrap>
        <SectionHead title={title} />
        {variant === "carousel" ? (
          <Carousel items={items} />
        ) : variant === "masonry" ? (
          <Masonry items={items} />
        ) : (
          <Grid items={items} />
        )}
      </Wrap>
    </section>
  );
}

const ASPECTS = ["aspect-[3/4]", "aspect-square", "aspect-[4/5]"] as const;

function key(m: GalleryItem, i: number) {
  return m.media_id ?? m.url ?? i;
}

function Foto({ item, index, sizes, aspect }: { item: GalleryItem; index: number; sizes: string; aspect: string }) {
  return (
    <div className={`relative ${aspect} overflow-hidden rounded-2xl border border-[color:var(--lp-line)] bg-[var(--lp-surface)]`}>
      <LpImage media={item} alt={item.alt || `Peça ${index + 1}`} sizes={sizes} />
      {item.price ? (
        <span className="absolute bottom-2 left-2 rounded-full bg-[var(--lp-brand)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--lp-on-brand)] shadow-sm">
          {item.price}
        </span>
      ) : null}
    </div>
  );
}

function Legenda({ item }: { item: GalleryItem }) {
  if (!item.alt) return null;
  return <figcaption className={`mt-2 ${T.meta}`}>{item.alt}</figcaption>;
}

function Grid({ items }: { items: GalleryItem[] }) {
  return (
    <ul className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5">
      {items.map((m, i) => (
        <li key={key(m, i)}>
          <figure>
            <Foto item={m} index={i} aspect="aspect-[3/4]" sizes="(min-width: 1024px) 30vw, 50vw" />
            <Legenda item={m} />
          </figure>
        </li>
      ))}
    </ul>
  );
}

function Masonry({ items }: { items: GalleryItem[] }) {
  return (
    <div className="mt-10 columns-2 gap-3 lg:columns-3 lg:gap-5">
      {items.map((m, i) => (
        <figure key={key(m, i)} className="mb-3 break-inside-avoid lg:mb-5">
          <Foto item={m} index={i} aspect={ASPECTS[i % ASPECTS.length]} sizes="(min-width: 1024px) 30vw, 50vw" />
          <Legenda item={m} />
        </figure>
      ))}
    </div>
  );
}

function Carousel({ items }: { items: GalleryItem[] }) {
  return (
    // Sangra até a borda da tela: as margens negativas anulam exatamente o padding
    // do WRAP (px-6 / lg:px-10), então o trilho encosta no canto sem criar rolagem
    // horizontal na página.
    <div className="-mx-6 mt-10 overflow-x-auto px-6 pb-2 lg:-mx-10 lg:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex snap-x snap-mandatory gap-3 lg:gap-5">
        {items.map((m, i) => (
          <li key={key(m, i)} className="w-[68%] shrink-0 snap-start sm:w-[42%] lg:w-[28%]">
            <figure>
              <Foto item={m} index={i} aspect="aspect-[3/4]" sizes="(min-width: 1024px) 28vw, 68vw" />
              <Legenda item={m} />
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
