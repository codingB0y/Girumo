import { Logo } from "@/components/brand/logo";
import { FaqList } from "@/components/lp-shared/faq-list";
import { PERGUNTA_GRUPOS, PERGUNTA_SEGMENTO } from "@/components/lp-shared/lead-message";
import { LeadWizard } from "@/components/lp-shared/lead-wizard";
import { APOIO_ESCURO, FAIXA, FOCO_ESCURO, MIOLO, TITULO } from "@/components/lp-piloto/ui";
import { cn } from "@/lib/utils";

const LINK_RODAPE = cn(
  "inline-flex min-h-11 min-w-11 items-center justify-center text-paper-0 underline decoration-1 underline-offset-4 hover:text-acid-500",
  FOCO_ESCURO,
);

export function PilotoDuvidas() {
  return (
    <section aria-labelledby="piloto-duvidas" className={cn("bg-canvas-100 py-10 lg:py-[88px]", FAIXA)}>
      <div className={cn(MIOLO, "grid gap-3.5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16")}>
        <h2 id="piloto-duvidas" className={cn("text-[32px] lg:text-[52px]", TITULO)}>
          Perguntas antes de ligar o automático.
        </h2>
        <FaqList variant="piloto" className="min-w-0" />
      </div>
    </section>
  );
}

/**
 * Fecho escuro com o formulário de novo — outra instância, que recomeça no passo 1.
 * No desktop o texto fica à esquerda do formulário; no celular o PS vem depois
 * dele. O bloco de texto usa `contents` no celular para o PS poder descer.
 */
export function PilotoFecho() {
  return (
    <section aria-labelledby="piloto-fecho" className={cn("bg-volt-950 py-10 text-paper-0 lg:py-[88px]", FAIXA)}>
      <div className={cn(MIOLO, "flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16")}>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <h2
            id="piloto-fecho"
            className={cn("order-1 text-[38px] lg:order-none lg:text-[64px]", TITULO, "leading-[1.14] lg:leading-[1.16]")}
          >
            Liga o piloto automático{" "}
            <span className="rounded-lg bg-acid-500 px-2 text-volt-950 lg:rounded-[10px] lg:px-2.5">hoje.</span>
          </h2>
          <p className={cn("hidden text-[19px] leading-[1.55] lg:block", APOIO_ESCURO)}>
            Cada dia postando na mão é hora perdida e cliente indo pro concorrente.
          </p>
          <p
            className={cn(
              "order-3 text-sm leading-normal lg:order-none lg:border-t lg:border-volt-800 lg:pt-4 lg:text-base lg:leading-[1.55]",
              APOIO_ESCURO,
            )}
          >
            <b className="font-bold text-paper-0">PS:</b> se em 7 dias você não gostar, devolvemos tudo. Você não
            arrisca nada pra ver a Girumo rodando nos seus grupos.
          </p>
        </div>
        <div className="order-2 min-w-0 lg:order-none">
          <LeadWizard variant="piloto" steps={[PERGUNTA_GRUPOS, PERGUNTA_SEGMENTO]} />
        </div>
      </div>
    </section>
  );
}

export function PilotoRodape() {
  return (
    <footer
      className={cn(
        "border-t border-volt-800 bg-volt-950 pb-7 pt-5 text-[13px] lg:py-[26px] lg:text-sm",
        APOIO_ESCURO,
        FAIXA,
      )}
    >
      <div className={cn(MIOLO, "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-6 lg:flex")}>
        <Logo className="text-[17px] text-paper-0 lg:text-[21px]" />
        <nav aria-label="Rodapé" className="flex flex-wrap justify-end gap-x-3.5 lg:ml-auto lg:gap-x-6">
          <a href="/login" className={LINK_RODAPE}>
            Entrar
          </a>
          <a href="/termos" className={LINK_RODAPE}>
            Termos
          </a>
          <a href="/privacidade" className={LINK_RODAPE}>
            Privacidade
          </a>
        </nav>
        <p className="col-span-2">© {new Date().getFullYear()} Girumo</p>
      </div>
    </footer>
  );
}
