import { ChevronDown } from "lucide-react";
import { LP_FAQ, type LpVariant } from "@/components/lp-shared/lp-data";
import { cn } from "@/lib/utils";

interface EstiloFaq {
  item: string;
  /** O padding mora no summary, e não no item, para a área de toque ser a faixa inteira (≥ 44 px). */
  pergunta: string;
  icone: string;
  /** Margem negativa devolve o respiro que o padding de baixo do summary já deu. */
  resposta: string;
}

const ESTILO: Record<LpVariant, EstiloFaq> = {
  cartaz: {
    item: "border-t-[1.5px] border-volt-950 last:border-b-[1.5px]",
    pergunta: "gap-3.5 px-0.5 py-[18px] text-[17px] font-bold lg:gap-5 lg:px-1 lg:py-6 lg:text-[21px]",
    icone: "mt-px size-[22px] lg:size-6",
    resposta:
      "-mt-2.5 px-0.5 pb-[18px] text-base leading-[1.55] lg:-mt-3 lg:max-w-[640px] lg:px-1 lg:pb-6 lg:text-lg lg:leading-[1.6]",
  },
  piloto: {
    item: "border-t-[1.5px] border-[#C9CCC4] last:border-b-[1.5px]",
    pergunta: "gap-3 px-0.5 py-[18px] text-base font-extrabold lg:gap-4 lg:px-1 lg:py-[22px] lg:text-[19px]",
    icone: "size-5 lg:size-[22px]",
    resposta:
      "-mt-2.5 px-0.5 pb-[18px] text-[15px] leading-normal text-slate-600 lg:-mt-3 lg:px-1 lg:pb-[22px] lg:text-[17px] lg:leading-[1.55]",
  },
  atacado: {
    item: "border-t-[1.5px] border-volt-950 last:border-b-[1.5px]",
    pergunta: "gap-3 px-0.5 py-4 text-base font-extrabold lg:gap-4 lg:px-1 lg:py-[22px] lg:text-[19px]",
    icone: "size-5 lg:size-[22px]",
    resposta:
      "-mt-2 px-0.5 pb-4 text-[15px] font-medium leading-normal lg:-mt-3 lg:px-1 lg:pb-[22px] lg:text-[17px] lg:leading-[1.55]",
  },
};

/** Perguntas frequentes com <details>: abre e fecha sem JavaScript, e a primeira já vem aberta. */
export function FaqList({ variant, className }: { variant: LpVariant; className?: string }) {
  const e = ESTILO[variant];
  return (
    <div className={className}>
      {LP_FAQ.map(([pergunta, resposta], indice) => (
        <details key={pergunta} open={indice === 0} className={cn("group", e.item)}>
          <summary
            className={cn(
              "flex cursor-pointer list-none items-start justify-between [&::-webkit-details-marker]:hidden",
              e.pergunta,
            )}
          >
            {pergunta}
            <ChevronDown
              aria-hidden
              className={cn(
                "shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none",
                e.icone,
              )}
            />
          </summary>
          <p className={e.resposta}>{resposta}</p>
        </details>
      ))}
    </div>
  );
}
