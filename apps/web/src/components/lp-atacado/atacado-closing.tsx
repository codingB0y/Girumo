import { CONTEUDO, LATERAIS, TITULO } from "@/components/lp-atacado/atacado-ui";
import { FaqList } from "@/components/lp-shared/faq-list";
import { PERGUNTA_GRUPOS, PERGUNTA_LOJA } from "@/components/lp-shared/lead-message";
import { LeadWizard } from "@/components/lp-shared/lead-wizard";
import { PlanCards } from "@/components/lp-shared/plan-cards";
import { cn } from "@/lib/utils";

/** Selo dos 7 dias: direito de arrependimento do CDC (art. 49), o mesmo texto do FAQ. */
function Garantia() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-volt-950 bg-white p-3.5 lg:gap-[22px] lg:rounded-[22px] lg:px-6 lg:py-5">
      <span
        aria-hidden
        className={`${TITULO} grid size-14 shrink-0 place-items-center rounded-full border-2 border-volt-950 bg-acid-500 text-center text-lg lg:size-[88px] lg:text-[26px] lg:leading-[.9]`}
      >
        <span className="lg:hidden">7d</span>
        <span className="hidden lg:block">
          7
          <br />
          <span className="text-xs">DIAS</span>
        </span>
      </span>
      <p className="text-sm font-medium leading-[1.45] lg:text-[17px] lg:leading-normal">
        <b>
          Testa 7 dias.<span className="hidden lg:inline"> Não gostou, devolvemos tudo.</span>
        </b>
        <span className="lg:hidden"> Não gostou, devolvemos tudo. É lei.</span>
        <span className="hidden lg:inline">
          {" "}
          É o direito de arrependimento do Código de Defesa do Consumidor. Depois, cancela na própria tela, sem multa.
          Os grupos e os contatos continuam seus.
        </span>
      </p>
    </div>
  );
}

export function Planos() {
  return (
    <section
      aria-labelledby="planos-titulo"
      className={cn(LATERAIS, "border-t-2 border-volt-950 bg-canvas-100 py-10 lg:py-[88px]")}
    >
      <div className={cn(CONTEUDO, "flex flex-col gap-3.5 lg:gap-[30px]")}>
        {/* relative + z-10: fica por cima da linha do seletor, que sobe até aqui (ver PlanCards). */}
        <div className="lg:relative lg:z-10 lg:max-w-[60%]">
          <h2 id="planos-titulo" className={`${TITULO} text-[32px] lg:text-[52px]`}>
            Menos que uma peça por dia.
          </h2>
          <p className="mt-3 hidden text-lg font-medium lg:block">Pagamento no cartão. Troca de plano quando crescer.</p>
        </div>
        {/* O seletor Mensal | Anual mora dentro do PlanCards, numa linha só dele. A margem
            negativa (altura do seletor + o gap) sobe essa linha para a altura do título,
            como no mockup: título à esquerda, seletor à direita. */}
        <PlanCards variant="atacado" className="lg:-mt-[86px]" />
        <Garantia />
      </div>
    </section>
  );
}

export function Duvidas() {
  return (
    <section aria-labelledby="duvidas-titulo" className={cn(LATERAIS, "py-10 lg:py-[88px]")}>
      <div
        className={cn(
          CONTEUDO,
          "flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-16",
        )}
      >
        <h2 id="duvidas-titulo" className={`${TITULO} text-[32px] lg:text-[50px]`}>
          Dúvidas de quem vende na 44 e no Brás.
        </h2>
        <FaqList variant="atacado" />
      </div>
    </section>
  );
}

/** Fecho acid com o formulário de novo — uma instância nova, que recomeça no passo 1. */
export function Fecho() {
  return (
    <section aria-labelledby="fecho-titulo" className={cn(LATERAIS, "border-t-2 border-volt-950 bg-acid-500 py-10 lg:py-20")}>
      <div
        className={cn(
          CONTEUDO,
          "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,.95fr)] lg:items-center lg:gap-14",
        )}
      >
        {/* contents: no celular o PS desce para depois do formulário (order-last), como no
            mockup; no desktop ele fica embaixo do título, na coluna da esquerda. */}
        <div className="contents lg:flex lg:flex-col lg:gap-[18px]">
          <h2 id="fecho-titulo" className={`${TITULO} text-4xl lg:text-[60px]`}>
            A próxima coleção pode sair em todos os grupos de uma vez.
          </h2>
          <p className="order-last text-sm font-bold leading-normal lg:order-none lg:text-[17px] lg:font-semibold lg:leading-[1.55]">
            <b>PS:</b> são 7 dias pra desistir. Se não gostar, devolvemos tudo e os grupos continuam seus.
          </p>
        </div>
        <LeadWizard variant="atacado" steps={[PERGUNTA_LOJA, PERGUNTA_GRUPOS]} />
      </div>
    </section>
  );
}
