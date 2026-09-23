import Image from "next/image";
import { FOTOS, PRINT_GRUPOS } from "@/components/lp-shared/lp-data";
import { PlanCards } from "@/components/lp-shared/plan-cards";
import { FAIXA, InstagramIcon, MIOLO, TITULO } from "@/components/lp-piloto/ui";
import { cn } from "@/lib/utils";

/**
 * Prova: a loja cheia no Saldão e o print real dos grupos. No celular o título
 * vem antes da foto; no desktop a foto vai para a coluna da esquerda — o bloco
 * de texto usa `contents` no celular para o título, a foto e o texto dividirem
 * a mesma coluna na ordem certa.
 */
export function PilotoProva() {
  return (
    <section aria-labelledby="piloto-prova" className={cn("bg-canvas-100 py-10 lg:py-24", FAIXA)}>
      <div
        className={cn(
          MIOLO,
          "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14",
        )}
      >
        <div className="contents lg:col-start-2 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-[22px]">
          <h2 id="piloto-prova" className={cn("order-1 text-[32px] lg:order-none lg:text-[52px]", TITULO)}>
            Quem fez a Girumo já vendeu assim.
          </h2>
          {/* Era citação com aspas atribuída ao fundador: virou texto corrido, sem aspas nem assinatura. */}
          <p className="order-3 mt-2 rounded-2xl bg-paper-0 p-[18px] text-[17px] font-semibold leading-normal lg:order-none lg:mt-0 lg:rounded-[20px] lg:px-[26px] lg:py-6 lg:text-[21px]">
            A Mega Stock saiu de R$&nbsp;5&nbsp;mil pra R$&nbsp;350&nbsp;mil por mês vendendo em grupo de WhatsApp. A
            Girumo é esse jeito de vender virando ferramenta.
          </p>
          <p className="order-4 flex items-center gap-2 text-sm font-bold lg:order-none lg:gap-2.5 lg:text-[15px]">
            <InstagramIcon className="size-4 shrink-0 lg:size-[18px]" />
            @megainfantilatacado · 105 mil seguidores
          </p>
        </div>

        <div className="relative order-2 lg:order-none lg:col-start-1 lg:row-start-1 lg:h-[470px] lg:min-w-0">
          <figure className="m-0 h-[230px] w-full -rotate-[1.5deg] bg-white p-2.5 pb-3.5 shadow-[0_1px_2px_rgba(7,25,35,.14),0_14px_34px_rgba(7,25,35,.14)] lg:absolute lg:left-0 lg:top-0 lg:h-[430px] lg:w-[330px] lg:-rotate-2">
            <span className="relative block size-full overflow-hidden">
              <Image
                src={FOTOS.lojaCheia.src}
                alt={FOTOS.lojaCheia.alt}
                fill
                sizes="(min-width: 1024px) 310px, calc(100vw - 56px)"
                className="object-cover object-[50%_62%]"
              />
            </span>
          </figure>
          <figure className="absolute right-5 top-10 m-0 hidden h-[390px] w-[180px] rotate-3 overflow-hidden rounded-[26px] border-[7px] border-volt-950 shadow-[0_18px_36px_rgba(7,25,35,.2)] lg:block">
            <Image src={PRINT_GRUPOS.src} alt={PRINT_GRUPOS.alt} fill sizes="166px" className="object-cover object-top" />
          </figure>
        </div>
      </div>
    </section>
  );
}

/** Planos (seletor + cartões da base comum) e o selo dos 7 dias do CDC. */
export function PilotoPlanos() {
  return (
    <section aria-labelledby="piloto-planos" className={cn("py-10 lg:pb-[88px] lg:pt-24", FAIXA)}>
      <div className={cn(MIOLO, "flex flex-col gap-3.5 lg:gap-6")}>
        <div>
          <h2 id="piloto-planos" className={cn("text-[32px] lg:text-[56px]", TITULO)}>
            Um plano pra cada tamanho de operação.
          </h2>
          <p className="mt-3.5 hidden text-lg text-slate-600 lg:block">
            Pagamento no cartão. Troca de plano quando quiser.
          </p>
        </div>

        <PlanCards variant="piloto" />

        <div className="mt-1 flex items-center gap-3.5 rounded-2xl bg-canvas-100 p-4 lg:mt-2 lg:gap-[22px] lg:rounded-[20px] lg:px-[26px] lg:py-[22px]">
          <span
            aria-hidden
            className="grid size-[60px] shrink-0 place-items-center rounded-full border-2 border-volt-950 bg-acid-500 text-center lg:size-[84px] lg:border-[2.5px]"
          >
            <span className={cn("text-xl tabular-nums lg:text-2xl", TITULO, "leading-[.9]")}>
              7
              <span className="block text-[10px] lg:text-xs">DIAS</span>
            </span>
          </span>
          <p className="text-sm leading-[1.45] lg:text-[17px] lg:leading-normal">
            <b className="font-bold">Testa 7 dias. Não gostou, devolvemos tudo.</b> É o direito de arrependimento do
            Código de Defesa do Consumidor, e a gente cumpre sem burocracia. Depois, cancela na própria tela, sem multa.
          </p>
        </div>
      </div>
    </section>
  );
}
