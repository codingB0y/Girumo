import { cn } from "@/lib/utils";
import { Stars } from "@/components/landing/stars";

export type Testimonial = {
  quote: string;
  name: string;
  store: string;
  rating: number;
  highlight?: boolean;
};

/** Iniciais (2 letras) a partir do nome, pro avatar. */
function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <figure
      className={cn(
        "flex h-full flex-col rounded-3xl border p-7 transition",
        t.highlight
          ? "hf-ring border-transparent bg-breu-2 shadow-iris hf-glow lg:-mt-4 lg:pb-9"
          : "border-white/10 bg-white/[0.03] hover:border-iris/40",
      )}
    >
      <Stars rating={t.rating} />
      <blockquote className="font-editorial mt-4 flex-1 text-xl italic leading-snug text-white">
        “{t.quote}”
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        <span
          className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-iris-claro to-iris-escuro text-sm font-bold text-white"
          aria-hidden
        >
          {initials(t.name)}
        </span>
        <div>
          <p className="text-sm font-medium text-white">{t.name}</p>
          <p className="font-data text-xs uppercase tracking-wider text-bruma/45">{t.store}</p>
        </div>
      </figcaption>
    </figure>
  );
}
