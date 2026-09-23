import { Bell, Clock, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { HoursCalculator } from "@/components/lp-shared/hours-calculator";
import { CARTAO, FAIXA, IconeQuadrado, MIOLO, TITULO } from "@/components/lp-piloto/ui";
import { cn } from "@/lib/utils";

const DORES = [
  "Copiar e colar a mesma mensagem grupo por grupo",
  "Grupo lota e o link para de funcionar",
  "Esquecer de postar e o cliente comprar do concorrente",
  "Não saber qual anúncio trouxe a venda",
] as const;

const PROTECOES: ReadonlyArray<{ icone: LucideIcon; destaque: string; resto: string }> = [
  {
    icone: ShieldCheck,
    destaque: "Só posta em grupo que você administra.",
    resto: "Nunca manda mensagem no privado, em nenhum plano.",
  },
  { icone: Clock, destaque: "Ritmo seguro pra cada número.", resto: "Você não precisa configurar intervalo." },
  { icone: Bell, destaque: "Aviso na hora", resto: "se o celular desconectar." },
];

/** Números de ilustração do quadro do painel — não são fatos da Mega Stock. */
const SAUDE = [
  { valor: "0/465", rotulo: "mensagens hoje" },
  { valor: "93/h", rotulo: "teto por hora" },
  { valor: "0", rotulo: "falhas em 24h" },
] as const;

/** "Quanto custa fazer na mão": as dores (só no desktop) e a calculadora da base comum. */
export function PilotoConta() {
  return (
    <section aria-labelledby="piloto-conta" className={cn("bg-volt-950 py-10 text-paper-0 lg:py-24", FAIXA)}>
      <div className={cn(MIOLO, "grid gap-4 lg:grid-cols-2 lg:gap-14")}>
        <div className="flex min-w-0 flex-col gap-6">
          <h2 id="piloto-conta" className={cn("text-[32px] lg:text-[52px]", TITULO)}>
            Quanto custa fazer tudo isso na mão?
          </h2>
          <ul className="hidden flex-col gap-3.5 text-lg leading-[1.45] text-[#E7ECEA] lg:flex">
            {DORES.map((dor) => (
              <li key={dor} className="flex gap-3">
                {/* #FF8A95: 7,9:1 no volt-950. */}
                <X aria-hidden strokeWidth={2.2} className="mt-px size-[22px] shrink-0 text-[#FF8A95]" />
                {dor}
              </li>
            ))}
          </ul>
        </div>
        <HoursCalculator variant="piloto" defaults={{ grupos: 30, minutos: 2, posts: 2 }} className="min-w-0" />
      </div>
    </section>
  );
}

/** Segurança do número. O quadro "Saúde do seu número" é ilustração do painel e, como no mockup, só aparece no desktop. */
export function PilotoSeguranca() {
  return (
    <section aria-labelledby="piloto-seguranca" className={cn("py-10 lg:py-24", FAIXA)}>
      <div
        className={cn(
          MIOLO,
          "grid gap-3.5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-14",
        )}
      >
        <div className="flex min-w-0 flex-col gap-3.5 lg:gap-[22px]">
          <h2 id="piloto-seguranca" className={cn("text-[32px] lg:text-[52px]", TITULO)}>
            Automação que protege o seu número.
          </h2>
          <ul className="flex flex-col gap-3 text-base leading-[1.45] lg:gap-4 lg:text-lg lg:leading-normal">
            {PROTECOES.map((protecao) => (
              <li key={protecao.destaque} className="flex gap-3 lg:gap-3.5">
                <IconeQuadrado
                  icone={protecao.icone}
                  className="size-[34px] lg:size-[38px]"
                  iconClassName="size-[18px] lg:size-5"
                />
                <span>
                  <b className="font-bold">{protecao.destaque}</b> {protecao.resto}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={cn(CARTAO, "hidden min-w-0 flex-col gap-4 p-[26px] lg:flex")}>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xl font-bold">Saúde do seu número</p>
            {/* success-700 no #DDF7E6: 5,2:1. */}
            <span className="inline-flex items-center whitespace-nowrap rounded-full border-2 border-success-700 bg-[#DDF7E6] px-4 py-2 text-[13px] font-black uppercase tracking-[.02em] text-success-700">
              saudável
            </span>
          </div>
          <ul className="grid grid-cols-3 gap-3">
            {SAUDE.map((item) => (
              <li key={item.rotulo} className="rounded-[14px] bg-canvas-100 p-3.5">
                <p className={cn("text-[30px] tabular-nums", TITULO)}>{item.valor}</p>
                <p className="mt-1 text-[13px] text-slate-600">{item.rotulo}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm leading-normal text-slate-600">
            Número veterano, conectado pelo QR Code. O mesmo número de sempre, sem chip novo.
          </p>
        </div>
      </div>
    </section>
  );
}
