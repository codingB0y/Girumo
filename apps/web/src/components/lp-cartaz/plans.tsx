import { WHATSAPP_URL } from "@/components/lp3/landing-data";
import { FOCO, LATERAL, ROTULO, TITULO, ViewportText } from "@/components/lp-cartaz/cartaz-ui";
import { FaqList } from "@/components/lp-shared/faq-list";
import { PlanCards } from "@/components/lp-shared/plan-cards";
import { cn } from "@/lib/utils";

/** "Menos que uma peça por dia." — planos (PlanCards) e a etiqueta dos 7 dias. */
export function CartazPlans() {
  return (
    <section
      id="planos"
      aria-labelledby="cartaz-planos"
      className={cn(
        "flex flex-col gap-3.5 border-t-[1.5px] border-volt-950 bg-canvas-100 py-11 lg:gap-[26px] lg:py-24",
        LATERAL,
      )}
    >
      {/* No desktop o seletor Mensal | Anual fica na linha do título, como no mockup. */}
      <PlanCards
        variant="cartaz"
        header={
          <>
            <h2 id="cartaz-planos" className={cn(TITULO, "text-[46px] lg:text-[84px]")}>
              Menos que uma peça por dia.
            </h2>
            <p className="mt-4 hidden max-w-[640px] text-[19px] leading-[1.55] text-slate-600 lg:block">
              Postar na mão custa horas do seu dia, link morto e venda sem origem. Escolha o tamanho da sua operação e troque
              quando crescer.
            </p>
          </>
        }
      />
      <Guarantee />
    </section>
  );
}

/** Etiqueta kraft "7 dias PRA DESISTIR. É LEI." — o direito de arrependimento do CDC. */
function Guarantee() {
  return (
    <div className="mt-2 flex items-center gap-3.5 lg:mt-3.5 lg:gap-9">
      <p className="relative h-[84px] w-[150px] shrink-0 leading-[normal] lg:h-[180px] lg:w-[320px]">
        {/* Um desenho só, escalado: o traço não escala junto (non-scaling-stroke). */}
        <svg viewBox="0 0 320 180" aria-hidden className="absolute inset-0 size-full">
          <path
            d="M46 12 H310 A5 5 0 0 1 315 17 V163 A5 5 0 0 1 310 168 H46 L8 90 Z"
            fill="#D9C29C"
            stroke="#071923"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            className="lg:[stroke-width:2px]"
          />
          <circle
            cx="42"
            cy="90"
            r="10"
            fill="#FFFEFA"
            stroke="#071923"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            className="lg:[stroke-width:2px]"
          />
        </svg>
        <span className="absolute left-[34px] top-[11px] lg:left-[70px] lg:top-[26px]">
          <span className={cn(TITULO, "block text-[42px] tabular-nums lg:text-[88px]")}>7 dias</span>{" "}
          <span className={cn(ROTULO, "mt-0.5 block text-[10px] tracking-[.02em] lg:text-lg")}>
            PRA DESISTIR. É LEI.
          </span>
        </span>
      </p>
      <p className="text-sm leading-normal lg:text-[19px] lg:leading-[1.6]">
        <b>Não gostou? Devolvemos tudo.</b>{" "}
        <ViewportText
          mobile="Depois, cancela na própria tela, sem multa."
          desktop="Nos primeiros 7 dias você desiste e recebe tudo de volta: é o direito de arrependimento do Código de Defesa do Consumidor. Depois, cancela quando quiser, na própria tela de configurações. Sem multa, sem fidelidade, e os grupos e os contatos continuam seus."
        />
      </p>
    </div>
  );
}

/** "O que perguntam antes de começar." — FaqList e o atalho do WhatsApp. */
export function CartazFaq() {
  return (
    <section
      id="duvidas"
      aria-labelledby="cartaz-duvidas"
      className={cn(
        "flex flex-col border-t-[1.5px] border-volt-950 py-11 lg:grid lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-[72px] lg:py-24",
        LATERAL,
      )}
    >
      <div className="mb-3.5 flex flex-col gap-3 lg:mb-0 lg:gap-[22px]">
        <h2 id="cartaz-duvidas" className={cn(TITULO, "text-[42px] lg:text-[76px]")}>
          O que perguntam antes de começar.
        </h2>
        <p className="leading-[1.55] lg:text-lg">
          Não achou a sua?{" "}
          {/* py-3.5 num link inline: aumenta a área de toque pra 44 px sem mexer na altura da linha. */}
          <a
            href={WHATSAPP_URL}
            data-outbound="whatsapp_click"
            className={cn("py-3.5 font-bold underline decoration-2 underline-offset-4 hover:text-cobalt-700", FOCO)}
          >
            Chama no WhatsApp
          </a>
          . Quem responde é gente.
        </p>
      </div>
      <FaqList variant="cartaz" />
    </section>
  );
}
