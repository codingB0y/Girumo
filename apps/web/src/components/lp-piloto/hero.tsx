import Image from "next/image";
import { Check } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/landing/icons";
import { WHATSAPP_URL } from "@/components/lp3/landing-data";
import { PERGUNTA_GRUPOS, PERGUNTA_SEGMENTO } from "@/components/lp-shared/lead-message";
import { LeadWizard } from "@/components/lp-shared/lead-wizard";
import { FOTOS } from "@/components/lp-shared/lp-data";
import { APOIO_ESCURO, Duo, FAIXA, FOCO_ESCURO, MIOLO, TITULO } from "@/components/lp-piloto/ui";
import { cn } from "@/lib/utils";

const PROMESSAS = [
  "Grupo lotou? O próximo nasce sozinho",
  "Uma mensagem vai pra todos os grupos, na hora marcada",
  "Cliques, entradas e vendas num painel só",
] as const;

/** Só os números da Mega Stock liberados no briefing. No celular a legenda é a curta do mockup. */
const NUMEROS = [
  {
    valor: "R$ 350 mil",
    celular: "por mês na operação de origem",
    desktop: "por mês na operação que deu origem à Girumo",
  },
  {
    valor: "12 mil",
    celular: "pessoas em 50+ grupos",
    desktop: "pessoas em mais de 50 grupos rodando juntos",
  },
  {
    valor: "20 mil",
    celular: "peças vendidas em 2 dias",
    desktop: "peças vendidas em 2 dias, avisando só nos grupos",
  },
  {
    valor: "105 mil",
    celular: "seguidores no Instagram",
    desktop: "seguidores no Instagram da Mega Stock, a loja por trás",
  },
] as const;

/** Sem menu: só a marca e o atalho do WhatsApp (ícone no celular, texto no desktop). */
export function PilotoHeader() {
  return (
    <header className={cn("bg-volt-950 py-3 text-paper-0 lg:py-[18px]", FAIXA)}>
      <div className={cn(MIOLO, "flex items-center justify-between gap-4")}>
        <Logo className="text-[21px] lg:text-[26px]" />
        <a
          href={WHATSAPP_URL}
          data-outbound="whatsapp_click"
          className={cn(
            "grid size-11 place-items-center rounded-xl bg-volt-900 lg:flex lg:size-auto lg:min-h-11 lg:items-center lg:gap-2.5 lg:bg-transparent lg:text-[15px] lg:font-bold lg:underline-offset-4 lg:hover:underline",
            FOCO_ESCURO,
          )}
        >
          <WhatsAppIcon className="size-[22px] shrink-0 text-acid-500 lg:size-5" />
          <span className="sr-only lg:not-sr-only">Dúvidas? Fala com a gente</span>
        </a>
      </div>
    </header>
  );
}

/**
 * Herói (fundo escuro) + faixa de números. No celular a 1ª tela é selo, título,
 * uma frase e o formulário — as promessas em lista só entram no desktop.
 */
export function PilotoHero() {
  return (
    <>
      <section
        aria-labelledby="piloto-titulo"
        className={cn("bg-volt-950 pb-[30px] pt-[22px] text-paper-0 lg:pb-[72px] lg:pt-14", FAIXA)}
      >
        <div
          className={cn(
            MIOLO,
            "grid gap-[18px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center lg:gap-16",
          )}
        >
          <div className="flex min-w-0 flex-col gap-[18px] lg:gap-[26px]">
            <p className="flex items-center gap-2.5 self-start rounded-full border border-volt-800 bg-volt-900 py-[5px] pl-[5px] pr-3.5 text-[13px] font-semibold leading-[1.3] text-[#E7ECEA] lg:gap-3 lg:py-1.5 lg:pl-1.5 lg:pr-4 lg:text-[15px]">
              {/* Uma foto só, da fila na fachada, no lugar dos avatares do time. */}
              <span className="relative size-9 shrink-0 overflow-hidden rounded-full border-2 border-volt-900 lg:size-11">
                <Image
                  src={FOTOS.filaFachada.src}
                  alt=""
                  fill
                  priority
                  sizes="44px"
                  className="object-cover object-[50%_78%]"
                />
              </span>
              <span>
                Feita por quem levou uma loja de{" "}
                {/* Espaço inseparável dentro de cada valor: no celular a frase quebra em 2 linhas e não pode partir "R$ / 350 mil". */}
                <b className="font-bold text-paper-0">R$&nbsp;5&nbsp;mil a R$&nbsp;350&nbsp;mil por mês</b>
              </span>
            </p>

            <h1
              id="piloto-titulo"
              className={cn("text-[42px] lg:text-[52px] xl:text-[68px]", TITULO, "leading-[1.14] lg:leading-[1.16]")}
            >
              Seus grupos de WhatsApp vendendo no{" "}
              {/* clone: quando quebra em 2 linhas, cada pedaço ganha canto e respiro próprios. */}
              <span className="rounded-lg bg-acid-500 box-decoration-clone px-2 text-volt-950 lg:rounded-[10px] lg:px-3">
                piloto automático.
              </span>
            </h1>

            <p className={cn("text-[17px] leading-normal lg:max-w-[600px] lg:text-xl lg:leading-[1.55]", APOIO_ESCURO)}>
              <Duo
                celular="Grupo novo quando lota, mensagem em todos de uma vez e a origem de cada venda."
                desktop="A Girumo cria um grupo novo quando o atual lota, posta suas mensagens em todos de uma vez e mostra de onde veio cada venda. Você para de viver no celular."
              />
            </p>

            <ul className="hidden flex-col gap-3 text-lg font-semibold lg:flex">
              {PROMESSAS.map((promessa) => (
                <li key={promessa} className="flex items-center gap-3">
                  <span aria-hidden className="grid size-[26px] shrink-0 place-items-center rounded-full bg-acid-500 text-volt-950">
                    <Check strokeWidth={2.6} className="size-[15px]" />
                  </span>
                  {promessa}
                </li>
              ))}
            </ul>
          </div>

          <div id="comecar" className="min-w-0">
            <LeadWizard
              variant="piloto"
              steps={[PERGUNTA_GRUPOS, PERGUNTA_SEGMENTO]}
              title="Veja funcionando nos seus grupos"
              subtitle="3 perguntas rápidas. No fim, o WhatsApp abre com a sua mensagem pronta."
            />
          </div>
        </div>
      </section>

      <div className={cn("border-t border-volt-800 bg-volt-900 py-[22px] text-paper-0 lg:py-[30px]", FAIXA)}>
        <ul className={cn(MIOLO, "grid grid-cols-2 gap-x-3.5 gap-y-[18px] lg:grid-cols-4 lg:gap-0")}>
          {NUMEROS.map((numero) => (
            <li
              key={numero.valor}
              className="min-w-0 lg:border-l lg:border-volt-800 lg:px-6 lg:first:border-l-0 lg:first:pl-0 lg:last:pr-0"
            >
              <p className={cn("text-[28px] tabular-nums lg:text-4xl", TITULO)}>{numero.valor}</p>
              <p className={cn("mt-1 text-[13px] leading-[1.35] lg:mt-1.5 lg:text-sm lg:leading-[1.4]", APOIO_ESCURO)}>
                <Duo celular={numero.celular} desktop={numero.desktop} />
              </p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
