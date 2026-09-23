import { X } from "lucide-react";
import { CONTEUDO, LATERAIS, TITULO } from "@/components/lp-atacado/atacado-ui";
import { HoursCalculator } from "@/components/lp-shared/hours-calculator";
import { cn } from "@/lib/utils";

/** `curto` completa o título no celular ("Conecta seu WhatsApp pelo QR Code…"); `texto` é o parágrafo do desktop. */
const PASSOS = [
  {
    titulo: "Conecta seu WhatsApp",
    curto: " pelo QR Code, em 2 minutos",
    texto: "Lê o QR Code com o seu número de sempre. Leva 2 minutos.",
  },
  {
    titulo: "Lota os grupos",
    curto: " com um link na bio e no anúncio",
    texto: "Um link na bio e no anúncio. Grupo cheio? Outro abre sozinho.",
  },
  {
    titulo: "Posta e vende",
    curto: ": novidades, lançamentos e promoções",
    texto: "Agenda novidades, lançamentos e promoções pra todos os grupos.",
  },
] as const;

const DORES = [
  "Mandar a coleção grupo por grupo, foto por foto",
  "Grupo lotado e revendedora sem conseguir entrar",
  "Promoção postada tarde, quando ela já comprou de outro",
  "Não saber quem pediu o quê, nem de qual grupo",
] as const;

export function TresPassos() {
  return (
    <section
      aria-labelledby="passos-titulo"
      className={cn(LATERAIS, "border-y-2 border-volt-950 bg-canvas-100 py-9 lg:py-[88px]")}
    >
      <div className={cn(CONTEUDO, "flex flex-col gap-3.5 lg:gap-9")}>
        <h2 id="passos-titulo" className={`${TITULO} text-[32px] lg:text-[52px]`}>
          Começa hoje, em 3 passos.
        </h2>
        <ol className="flex flex-col gap-3.5 lg:grid lg:grid-cols-3 lg:gap-[22px]">
          {PASSOS.map(({ titulo, curto, texto }, indice) => (
            <li key={titulo} className="flex items-center gap-3.5 lg:items-start lg:gap-[18px]">
              {/* O número já vem da lista (ol); o círculo é só desenho. */}
              <span
                aria-hidden
                className={`${TITULO} grid size-12 shrink-0 place-items-center rounded-full border-2 border-volt-950 bg-acid-500 text-[22px] lg:size-16 lg:text-[30px]`}
              >
                {indice + 1}
              </span>
              <div className="text-base leading-[1.4]">
                <h3 className="inline font-bold lg:block lg:text-[22px] lg:font-extrabold lg:leading-tight">{titulo}</h3>
                <span className="lg:hidden">{curto}</span>
                <p className="mt-2 hidden text-[17px] font-medium leading-normal lg:block">{texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function HorasNaMao() {
  return (
    <section aria-labelledby="horas-titulo" className={cn(LATERAIS, "bg-volt-950 py-10 text-paper-0 lg:py-[88px]")}>
      <div className={cn(CONTEUDO, "grid gap-3.5 lg:grid-cols-2 lg:gap-14")}>
        <div className="flex flex-col gap-[22px]">
          <h2 id="horas-titulo" className={`${TITULO} text-[32px] lg:text-[50px]`}>
            Quanto tempo você perde postando na mão?
          </h2>
          {/* Só no desktop, como no mockup: no celular a conta vem logo depois do título. */}
          <ul className="hidden flex-col gap-3.5 text-lg font-medium leading-[1.45] text-[#E7ECEA] lg:flex">
            {DORES.map((dor) => (
              <li key={dor} className="flex gap-3">
                <X aria-hidden className="mt-px size-[22px] shrink-0 text-[#FF8A95]" />
                {dor}
              </li>
            ))}
          </ul>
        </div>
        <HoursCalculator
          variant="atacado"
          defaults={{ grupos: 40, minutos: 3, posts: 2 }}
          className="lg:self-start"
        />
      </div>
    </section>
  );
}
