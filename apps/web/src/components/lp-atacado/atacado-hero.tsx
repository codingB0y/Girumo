import Image from "next/image";
import { Receipt, Zap } from "lucide-react";
import {
  COR_NOME,
  CONTEUDO,
  ETIQUETA,
  GRIFO,
  ICONE,
  LATERAIS,
  TITULO,
} from "@/components/lp-atacado/atacado-ui";
import { PERGUNTA_GRUPOS, PERGUNTA_LOJA } from "@/components/lp-shared/lead-message";
import { LeadWizard } from "@/components/lp-shared/lead-wizard";
import { FOTOS } from "@/components/lp-shared/lp-data";
import { Bubble, ChatFrame } from "@/components/lp-shared/whatsapp-mock";
import { cn } from "@/lib/utils";

const TAMANHO_ETIQUETA = "px-3 py-1.5 text-xs lg:px-4 lg:py-2 lg:text-[15px]";

/**
 * Letra das bolhas do celular do herói: 12,5 px no celular (como o mockup) e
 * o padrão de 13,5 px no desktop. O leading vai junto porque, sem ele, o cn()
 * da Bubble descarta o leading dela ao receber outro tamanho.
 */
const BOLHA = "text-[12.5px] lg:text-[13.5px]";

/** Fotos do post de lançamento, cada uma com o seu recorte. O 4º quadrado é o "+14". */
const FOTOS_DO_POST = [
  { foto: FOTOS.clientesNaArara, recorte: "object-[50%_28%]" },
  { foto: FOTOS.filaDentro, recorte: "object-[50%_44%]" },
  { foto: FOTOS.lojaCheia, recorte: "object-[50%_62%]" },
] as const;

/** Post de lançamento com as respostas no grupo, o selo de relâmpago e o pedido com origem. */
function ConversaDoGrupo() {
  return (
    <div className="relative mx-auto h-[540px] w-full max-w-[420px] lg:mx-0 lg:h-[680px] lg:max-w-none">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 top-6 rounded-[28px] border-2 border-volt-950 bg-acid-500 lg:left-[10%] lg:top-[30px] lg:rounded-[36px]"
      />
      <ChatFrame
        title="Moda 44 · VIP Revenda 07"
        subtitle="1.004 participantes"
        avatar="07"
        className="absolute left-[34px] top-0 h-[520px] w-[280px] -rotate-3 rounded-[28px] border-[7px] lg:left-[18%] lg:h-[660px] lg:w-[340px] lg:rounded-[34px] lg:border-[9px]"
      >
        <Bubble me time="07:00" read className={cn(BOLHA, "max-w-[94%] lg:max-w-[92%]")}>
          {/* Margem negativa: as fotos vão quase até a borda da bolha, e o texto fica no respiro normal. */}
          <div className="-mx-1.5 -mt-[3px] mb-1.5 grid grid-cols-2 gap-[3px] overflow-hidden rounded-md lg:-mx-[5px] lg:-mt-0.5 lg:rounded-[7px]">
            {FOTOS_DO_POST.map(({ foto, recorte }) => (
              <div key={foto.src} className="relative h-[70px] lg:h-[92px]">
                <Image
                  src={foto.src}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 140px, 115px"
                  className={cn("object-cover", recorte)}
                />
              </div>
            ))}
            <div className="grid h-[70px] place-items-center bg-slate-600 text-lg font-bold text-white lg:h-[92px] lg:text-[22px]">
              +14
            </div>
          </div>
          <b>LANÇAMENTO · COLEÇÃO VERÃO</b>
          <br />
          <span className="hidden lg:inline">
            18 modelos · pronta entrega
            <br />
          </span>
          Comenta <b>EU QUERO</b>
          <span className="hidden lg:inline"> com o número da peça</span>
        </Bubble>
        <Bubble name="Josiane" nameColor={COR_NOME.azul} time="07:01" className={BOLHA}>
          EU QUERO o 3 e o 7
        </Bubble>
        <Bubble name="Kelly" nameColor={COR_NOME.rosa} time="07:01" className={BOLHA}>
          quero! tem G?
        </Bubble>
        <Bubble name="Tatiane" nameColor={COR_NOME.verde} time="07:02" className={BOLHA}>
          separa 2 de cada<span className="hidden lg:inline"> pra mim</span>
        </Bubble>
        <Bubble name="Rosângela" nameColor={COR_NOME.marrom} time="07:02" className={BOLHA}>
          EU QUERO
        </Bubble>
        <Bubble name="Luciene" nameColor={COR_NOME.roxo} time="07:03" className={cn(BOLHA, "hidden lg:block")}>
          manda a tabela de preço
        </Bubble>
      </ChatFrame>

      <p
        className={cn(
          ETIQUETA,
          "absolute right-0 top-[60px] rotate-6 bg-volt-950 px-3 py-[7px] text-xs text-paper-0 lg:right-2.5 lg:top-[70px] lg:rotate-[5deg] lg:px-[18px] lg:py-2.5 lg:text-base",
        )}
      >
        <Zap aria-hidden className="size-3.5 shrink-0 lg:size-[18px]" />
        <span>
          <span className="hidden lg:inline">Promoção </span>relâmpago
        </span>
      </p>

      <p className="absolute bottom-4 left-2 right-[60px] flex items-center gap-2.5 rounded-[14px] border-2 border-volt-950 bg-white px-3 py-2.5 text-[13px] leading-[1.3] shadow-[0_4px_0_#071923] lg:bottom-[60px] lg:left-auto lg:right-3 lg:w-[300px] lg:gap-3 lg:rounded-[18px] lg:px-4 lg:py-3.5 lg:text-sm lg:leading-[1.35] lg:shadow-[0_6px_0_#071923]">
        <span aria-hidden className={cn(ICONE, "size-[34px] lg:size-10")}>
          <Receipt className="size-[18px] lg:size-5" />
        </span>
        <span>
          <b>
            Pedido de Josiane · <span className="whitespace-nowrap">R$ 342</span>
          </b>
          <br />
          <span className="text-slate-600">veio do grupo VIP 07</span>
        </span>
      </p>
    </div>
  );
}

/**
 * Herói do /44eBras: título, formulário (dentro de #comecar, destino dos botões
 * do meio da página) e a conversa do grupo. No celular a conversa desce para
 * depois do formulário — a 1ª tela é título + formulário.
 */
export function AtacadoHero() {
  return (
    <section aria-labelledby="atacado-titulo" className={cn(LATERAIS, "pb-[30px] pt-5 lg:pb-[72px] lg:pt-[52px]")}>
      <div className={cn(CONTEUDO, "grid gap-[26px] lg:grid-cols-2 lg:items-center lg:gap-12")}>
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <ul className="flex flex-wrap gap-1.5 lg:gap-2.5">
            <li className={cn(ETIQUETA, TAMANHO_ETIQUETA, "-rotate-2 bg-acid-500")}>
              <span>
                Lançamento<span className="hidden lg:inline"> de coleção</span>
              </span>
            </li>
            <li className={cn(ETIQUETA, TAMANHO_ETIQUETA, "rotate-[1.5deg] bg-volt-950 text-paper-0")}>Promoções</li>
            <li className={cn(ETIQUETA, TAMANHO_ETIQUETA, "bg-paper-0 lg:-rotate-1")}>
              <span>
                Novidades<span className="hidden lg:inline"> do dia</span>
              </span>
            </li>
          </ul>

          <h1 id="atacado-titulo" className={`${TITULO} text-[42px] lg:text-[62px]`}>
            Poste a novidade uma vez. <span className={GRIFO}>Venda em todos os grupos.</span>
          </h1>

          <p className="text-base font-medium leading-normal lg:max-w-[600px] lg:text-[19px] lg:leading-[1.55]">
            <span className="lg:hidden">Coleção</span>
            <span className="hidden lg:inline">Lançamento de coleção</span>, promoção e novidade do dia saem em todos
            os seus grupos de WhatsApp ao mesmo tempo.
            <span className="hidden lg:inline"> E o seu link enche os grupos de revendedoras, um depois do outro.</span>
          </p>

          {/* Sem scroll-mt: o scroll-padding-top global (globals.css) já dá o respiro no salto. */}
          <div id="comecar">
            <LeadWizard variant="atacado" steps={[PERGUNTA_LOJA, PERGUNTA_GRUPOS]} />
          </div>
        </div>

        <ConversaDoGrupo />
      </div>
    </section>
  );
}
