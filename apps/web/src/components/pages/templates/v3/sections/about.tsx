import type { AboutSection } from "@/lib/pages/sections";
import { LpImage } from "@/components/pages/templates/sections/lp-image";
import { Wrap } from "@/components/pages/templates/v3/primitives";
import { SECTION, T } from "@/components/pages/templates/v3/tokens";

/**
 * "Quem está por trás": foto grande + história curta em primeira pessoa
 * (La Lumini, Aula Magna). Sem foto, o texto fica sozinho e mais largo.
 */
export function About({ section }: { section: AboutSection }) {
  const { title, name, role, text, media } = section.data;

  return (
    <section className={`bg-[var(--lp-surface)] ${SECTION}`}>
      <Wrap className={media ? "lg:grid lg:grid-cols-12 lg:items-center lg:gap-14" : ""}>
        {media ? (
          <figure className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-[1.5rem] border border-[color:var(--lp-line)] lg:col-span-5 lg:max-w-none">
            <LpImage media={media} alt={media.alt || `Foto de ${name}`} sizes="(min-width: 1024px) 40vw, 100vw" />
          </figure>
        ) : null}
        <div className={media ? "mt-8 lg:col-span-7 lg:mt-0" : "max-w-3xl"}>
          <p className={T.eyebrow}>{title}</p>
          <h2 className={`mt-3 ${T.h2}`}>{name}</h2>
          {role ? <p className={`mt-2 ${T.meta}`}>{role}</p> : null}
          <p className={`mt-6 ${T.lead}`}>{text}</p>
        </div>
      </Wrap>
    </section>
  );
}
