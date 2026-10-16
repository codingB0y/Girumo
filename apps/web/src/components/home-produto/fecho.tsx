import { ChevronDown } from "lucide-react";
import { HOME_FAQ } from "@/components/home-shared/home-data";
import { BotaoTeste, CINZA, FOCO, H2, MIOLO } from "@/components/home-produto/ui";
import { cn } from "@/lib/utils";

/** Perguntas em duas colunas (ref. InfinitePay): título à esquerda, sanfona à direita. */
export function ProdutoDuvidas() {
  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className={cn(CINZA, "scroll-mt-4 py-[60px] lg:py-24")}>
      <div className={cn(MIOLO, "grid gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-[84px]")}>
        <div>
          {/* O leading vem de novo DEPOIS do tamanho: o tailwind-merge descarta o do H2. */}
          <h2 id="duvidas-titulo" className={cn(H2, "text-[32px] leading-[1.18] lg:text-[44px]")}>
            Perguntas
            <br /> frequentes
          </h2>
          <p className="mt-3.5 max-w-[30em] text-[16.5px] leading-relaxed text-[#33474F]">
            Não achou o que procurava? Teste 7 dias com tudo liberado e veja na sua loja.
          </p>
        </div>
        <div>
          {HOME_FAQ.map(([pergunta, resposta], i) => (
            <details key={pergunta} open={i === 0} className="group border-b border-[#DCE2E6]">
              <summary
                className={cn(
                  "flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-md text-[16.5px] font-semibold [&::-webkit-details-marker]:hidden",
                  FOCO,
                )}
              >
                {pergunta}
                <ChevronDown aria-hidden className="size-5 shrink-0 text-slate-600 transition-transform group-open:rotate-180" />
              </summary>
              <p className="max-w-[44em] pb-[22px] text-[15.5px] leading-relaxed text-[#4A5E68]">{resposta}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Fecho escuro com o último botão. */
export function ProdutoFecho() {
  return (
    <section aria-labelledby="fecho-titulo" className="bg-volt-950 py-16 text-center text-white lg:py-24">
      <div className={MIOLO}>
        <h2 id="fecho-titulo" className="font-brand text-[30px] font-semibold leading-[1.12] tracking-[-.025em] lg:text-[44px]">
          Conecta o número hoje.
          <br /> Amanhã o post sai sozinho.
        </h2>
        <BotaoTeste seta escuro className="mt-[30px] h-14 px-[30px] text-[16.5px]" />
        <p className="mt-4 text-[14.5px] text-white/70">Você cadastra o cartão e só paga no 8º dia. Cancelou antes, não paga nada.</p>
      </div>
    </section>
  );
}
