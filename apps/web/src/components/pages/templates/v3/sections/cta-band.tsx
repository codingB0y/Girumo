import type { CtaBandSection } from "@/lib/pages/sections";
import { Wrap } from "@/components/pages/templates/v3/primitives";
import { ToFormButton } from "@/components/pages/templates/v3/to-form-button";

/**
 * Faixa de chamada: bloco cheio na cor da marca com a MESMA frase do formulário
 * (Fórmula de Lançamento repete seis vezes; Jornada, sete). O botão rola de
 * volta ao form — nunca abre o grupo direto.
 */
export function CtaBand({ section, cta }: { section: CtaBandSection; cta: string }) {
  const { title, note } = section.data;
  return (
    <section className="bg-[var(--lp-brand)] text-[color:var(--lp-on-brand)]">
      <Wrap className="flex flex-col items-center py-16 text-center lg:py-20">
        <h2 className="[font-family:var(--lp-font-display)] max-w-3xl text-balance text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.025em] lg:text-[2.75rem]">
          {title}
        </h2>
        {note ? <p className="mt-4 max-w-xl text-base opacity-85 lg:text-lg">{note}</p> : null}
        <div className="mt-8">
          <ToFormButton label={cta} invert />
        </div>
      </Wrap>
    </section>
  );
}
