import { ArrowRight, Check } from "lucide-react";
import { LogoSymbol } from "@/components/brand/logo";
import { SIGNUP_URL } from "@/components/lp3/landing-data";
import { CTA_TESTE, IMG } from "@/components/home-shared/home-data";
import { FOCO_ESCURO } from "@/components/home-shared/estilo";
import { Celular } from "@/components/home-shared/frames";
import { FOCO } from "@/components/home-vitrine/ui";
import { cn } from "@/lib/utils";

/** Faixa escura de novidade logo abaixo do cabeçalho (`.news`). */
export function VitrineNovidade() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 bg-volt-950 px-[18px] py-2.5 text-center text-[13.5px] text-white lg:h-[46px] lg:flex-nowrap lg:gap-3 lg:py-0 lg:text-[14.5px]">
      <span className="rounded-md bg-acid-500 px-[9px] py-[3px] text-xs font-bold uppercase tracking-[.04em] text-volt-950">
        Novo
      </span>
      <span>Lance o gasto do anúncio e veja quanto custou cada venda.</span>
      <a href="#como" className={cn("rounded-sm font-semibold text-acid-500 underline underline-offset-[3px]", FOCO_ESCURO)}>
        Ver como funciona
      </a>
    </div>
  );
}

/** Selo verde com o check, preso no leque (`.chip`). */
function Selo({ texto, className }: { texto: string; className: string }) {
  return (
    <span
      className={cn(
        "absolute z-[4] items-center gap-2.5 whitespace-nowrap rounded-full bg-white py-[9px] pl-[9px] pr-4 font-semibold shadow-[0_16px_36px_-16px_rgba(7,25,35,.45)]",
        className,
      )}
    >
      <span aria-hidden className="grid size-[26px] place-items-center rounded-full bg-acid-500">
        <Check strokeWidth={2.6} className="size-3.5" />
      </span>
      {texto}
    </span>
  );
}

/**
 * Herói centralizado com o leque de 5 celulares (ref. Tray). No celular ficam
 * os 3 do meio, cortados nas bordas como no mockup.
 */
export function VitrineHeroi() {
  return (
    <section aria-labelledby="vitrine-titulo" className="px-[18px] pt-7 text-center lg:px-6 lg:pt-[46px]">
      <p className="inline-flex h-9 items-center gap-2.5 rounded-full bg-[#F1F4EE] pl-1.5 pr-4 text-[13px] font-semibold lg:h-10 lg:text-[14.5px]">
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-volt-950 text-acid-500">
          <LogoSymbol className="size-[13px]" />
        </span>
        Pra quem vende em grupo de WhatsApp
      </p>
      <h1
        id="vitrine-titulo"
        className="mx-auto mt-5 max-w-[15em] font-brand text-[38px] font-bold leading-[1.08] tracking-[-.035em] lg:text-[62px] lg:leading-[1.06]"
      >
        Seus grupos de WhatsApp <span className="text-cobalt-500">cheios e vendendo todo dia</span>
      </h1>
      <p className="mx-auto mt-5 max-w-[38em] text-[16.5px] leading-[1.55] text-[#33474F] lg:text-[19px]">
        Um link enche os grupos, o post sai em todos na hora marcada e cada venda volta com a origem. Pra quem começa
        com 5 grupos ou já tem 50.
      </p>
      <div className="mt-[22px] flex flex-col gap-2.5 lg:mt-7 lg:flex-row lg:justify-center lg:gap-3">
        <a
          href={SIGNUP_URL}
          className={cn(
            "inline-flex h-14 items-center justify-center gap-3 whitespace-nowrap rounded-full bg-acid-500 px-[30px] text-[16.5px] font-bold hover:bg-[#B8FF5C]",
            FOCO,
          )}
        >
          {CTA_TESTE}
          <ArrowRight aria-hidden className="size-[19px] shrink-0" />
        </a>
        <a
          href="#planos"
          className={cn(
            "inline-flex h-14 items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-volt-950 px-[30px] text-[16.5px] font-bold hover:bg-[#F1F4EE]",
            FOCO,
          )}
        >
          Ver os planos
        </a>
      </div>
      <p className="mt-3.5 text-sm text-slate-600">Cadastra o cartão e a cobrança só começa no 8º dia.</p>

      <div className="relative -mx-[18px] mt-[30px] h-[420px] overflow-hidden lg:mx-0 lg:mt-[46px] lg:h-[500px]">
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[240px] bg-[#EEF9DC] lg:h-[300px]" />
        <Celular
          img={IMG.gruposCelular}
          alt="Grupos da campanha com a lotação de cada um"
          sizes="214px"
          className="absolute left-[calc(50%_-_677px)] top-[104px] z-[1] hidden w-[214px] lg:block"
        />
        <Celular
          img={IMG.inicioCelular}
          alt="Início ao vivo com o mapa dos grupos"
          sizes="(min-width: 1024px) 238px, 176px"
          className="absolute left-[calc(50%_-_284px)] top-11 z-[2] w-[176px] lg:left-[calc(50%_-_419px)] lg:top-[52px] lg:w-[238px]"
        />
        <Celular
          img={IMG.campanhaCelular}
          alt="Campanha com o botão Postar em 36 grupos"
          sizes="(min-width: 1024px) 272px, 206px"
          priority
          className="absolute left-[calc(50%_-_103px)] top-0 z-[3] w-[206px] lg:left-[calc(50%_-_136px)] lg:w-[272px]"
        />
        <Celular
          img={IMG.disparosCelular}
          alt="Disparos com a prévia de como a oferta chega no celular"
          sizes="(min-width: 1024px) 238px, 176px"
          className="absolute left-[calc(50%_+_108px)] top-11 z-[2] w-[176px] lg:left-[calc(50%_+_181px)] lg:top-[52px] lg:w-[238px]"
        />
        <Celular
          img={IMG.hojeCelular}
          alt="Hoje na campanha com os posts entregues"
          sizes="214px"
          className="absolute left-[calc(50%_+_463px)] top-[104px] z-[1] hidden w-[214px] lg:block"
        />
        <Selo
          texto="Grupo lotou, abre outro: ligado"
          className="bottom-[34px] right-3 flex text-[13px] lg:bottom-auto lg:left-[calc(50%_+_120px)] lg:right-auto lg:top-[92px] lg:text-[14.5px]"
        />
        <Selo texto="Postado em 36 de 36 grupos" className="hidden text-[14.5px] lg:left-[calc(50%_-_470px)] lg:top-[330px] lg:flex" />
      </div>
    </section>
  );
}
