import Image from "next/image";
import { ArrowRight, CalendarCheck, Clock, Users } from "lucide-react";
import { IMG } from "@/components/home-shared/home-data";
import { Celular } from "@/components/home-shared/frames";
import { BOTAO, FOCO, MIOLO } from "@/components/home-vitrine/ui";
import { cn } from "@/lib/utils";

const ITENS = [
  { icone: Users, texto: "Montagem junto" },
  { icone: CalendarCheck, texto: "Revisão mensal 1:1" },
  { icone: Clock, texto: "Prioridade no suporte" },
] as const;

/** Faixa cobalto do plano Operação, com notebook e celular (`.k4-op`). */
export function VitrineOperacao() {
  return (
    <section aria-labelledby="operacao-titulo" className="pb-[60px] lg:pb-24">
      <div className={MIOLO}>
        <div className="grid items-center gap-[22px] overflow-hidden rounded-3xl bg-cobalt-500 px-[22px] pb-[26px] pt-7 text-white lg:grid-cols-[minmax(0,1fr)_430px_auto] lg:gap-7 lg:px-11 lg:py-10">
          <div>
            {/* Cobalto escuro e não branco translúcido: texto pequeno precisa de 4,5:1, e o translúcido dava 3,4:1. */}
            <p className="inline-flex h-7 items-center rounded-full bg-cobalt-700 px-3 text-[12.5px] font-bold">Plano Operação</p>
            <h2 id="operacao-titulo" className="mt-3.5 text-balance font-brand text-2xl font-semibold leading-[1.2] tracking-[-.02em] lg:text-[30px]">
              Sua operação <em className="not-italic text-acid-500">montada junto</em> com a gente
            </h2>
            {/* Branco cheio: o branco translúcido do mockup não passa de 4,5:1 no cobalto. */}
            <p className="mt-2.5 max-w-[30em] text-[15px] leading-[1.55]">
              A gente conecta o número com você, organiza os grupos que já existem e deixa o primeiro post agendado.
            </p>
            <ul className="mt-5 flex flex-wrap gap-[22px]">
              {ITENS.map(({ icone: Icone, texto }) => (
                <li key={texto} className="flex items-center gap-2 text-sm font-semibold">
                  <Icone aria-hidden className="size-5 shrink-0" />
                  {texto}
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden className="relative h-[230px] lg:h-[250px]">
            <div className="absolute left-0 top-[22px] h-[178px] w-[270px] overflow-hidden rounded-xl border-8 border-b-[12px] border-[#0D1E28] bg-white shadow-[0_24px_50px_-20px_rgba(0,0,0,.5)] lg:h-[214px] lg:w-[370px]">
              <Image
                src={IMG.campanhaDesktop.src}
                alt=""
                width={IMG.campanhaDesktop.width}
                height={IMG.campanhaDesktop.height}
                sizes="370px"
                className="block h-auto w-full"
              />
            </div>
            <Celular img={IMG.hojeCelular} alt="" sizes="112px" className="absolute right-0 top-[30px] w-24 lg:left-[318px] lg:right-auto lg:w-28" />
          </div>
          <a href="#planos" className={cn(BOTAO, FOCO)}>
            Quero o Operação
            <ArrowRight aria-hidden className="size-[18px] shrink-0" />
          </a>
        </div>
      </div>
    </section>
  );
}
