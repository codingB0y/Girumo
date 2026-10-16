import { ArrowRight } from "lucide-react";
import { LogoSymbol } from "@/components/brand/logo";
import { PLANS, SIGNUP_URL } from "@/components/lp3/landing-data";
import { CTA_TESTE, IMG, plano, reais } from "@/components/home-shared/home-data";
import { Celular, Navegador } from "@/components/home-shared/frames";
import { custoPorDia } from "@/components/home-produto/calculo";
import { FOCO } from "@/components/home-produto/ui";
import { cn } from "@/lib/utils";

const DESTAQUES = [
  "7 dias grátis em todos os planos",
  "Um link pra todos os grupos",
  "Grupo lotou, o próximo nasce",
  "Post agendado em todos",
  "Venda com origem",
] as const;

function ListaDestaques({ oculta }: { oculta?: boolean }) {
  return (
    <ul
      aria-label={oculta ? undefined : "Destaques"}
      aria-hidden={oculta || undefined}
      className="flex shrink-0 items-center gap-3.5 pr-3.5 lg:gap-[22px] lg:pr-[22px]"
    >
      {DESTAQUES.map((destaque) => (
        <li key={destaque} className="flex items-center gap-3.5 lg:gap-[22px]">
          {destaque}
          <LogoSymbol className="size-3 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Faixa acid com os destaques (`.tick`). A lista vai duas vezes pra encher a
 * largura; a cópia é escondida do leitor de tela. A de baixo da página é toda
 * decorativa.
 */
export function ProdutoFaixa({ decorativa }: { decorativa?: boolean }) {
  return (
    <div
      aria-hidden={decorativa || undefined}
      className="flex h-[34px] items-center overflow-hidden whitespace-nowrap bg-acid-500 pl-3.5 text-[11.5px] font-bold uppercase tracking-[.05em] lg:h-10 lg:pl-5 lg:text-[13px]"
    >
      <ListaDestaques oculta={decorativa} />
      <ListaDestaques oculta />
    </div>
  );
}

const MENOR_ANUAL = Math.min(...PLANS.map((p) => p.annualPrice));

const NUMEROS = [
  { valor: "1 link", texto: "pra todos os grupos" },
  { valor: custoPorDia(plano("Growth").price), texto: "por dia no Growth mensal" },
  { valor: "7 dias", texto: "grátis pra testar tudo" },
  { valor: "0", texto: "mensagem no privado" },
] as const;

/** Cartão lavanda com a tela da campanha no computador (só no desktop) e no celular. */
function CartaoCampanha() {
  return (
    <div className="relative h-[540px] overflow-hidden rounded-3xl bg-[#E8EEFF] px-[22px] py-[26px] lg:h-[640px] lg:rounded-[32px] lg:px-11 lg:py-10">
      <h2 className="max-w-[11em] font-brand text-[25px] font-bold leading-[1.12] tracking-[-.025em] lg:text-[34px]">
        Postar em 36 grupos, de uma vez
      </h2>
      <p className="mt-2.5 max-w-[24em] text-sm text-[#3F5463] lg:text-[15px]">
        A tela da campanha, como está hoje no painel. Loja de exemplo.
      </p>
      <div aria-hidden className="absolute left-[190px] top-[178px] hidden w-[660px] lg:block">
        <Navegador img={IMG.campanhaDesktop} alt="" endereco="app.girumo.com.br/painel/campanhas" sizes="660px" />
      </div>
      <Celular
        img={IMG.campanhaCelular}
        alt="Tela da campanha no celular: botão Postar em 36 grupos, link da campanha, 36 grupos e 4.894 pessoas"
        sizes="(min-width: 1024px) 250px, 220px"
        priority
        className="absolute left-1/2 top-[150px] w-[220px] -translate-x-1/2 lg:left-11 lg:top-[250px] lg:w-[250px] lg:translate-x-0"
      />
    </div>
  );
}

/** Herói em duas colunas (ref. InfinitePay): texto com 4 números e o cartão lavanda com o painel. */
export function ProdutoHeroi() {
  return (
    <section
      aria-labelledby="produto-titulo"
      className="mx-auto grid max-w-[1440px] items-start gap-7 px-[18px] pb-10 pt-2.5 lg:grid-cols-[minmax(0,.86fr)_minmax(0,1.14fr)] lg:gap-14 lg:px-16 lg:pb-[70px] lg:pt-[26px]"
    >
      <div className="pt-2.5 lg:pt-[22px]">
        <h1
          id="produto-titulo"
          className="text-pretty font-brand text-[28px] font-semibold leading-[1.22] tracking-[-.022em] lg:text-[40px] lg:leading-[1.2]"
        >
          Encha os grupos pelo link, poste em todos de uma vez e saiba de onde veio cada venda.
        </h1>
        <p className="mt-3.5 text-base text-[#33474F] lg:mt-[18px] lg:text-lg">
          No seu WhatsApp de sempre, com tudo num painel em português:
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 lg:mt-5 lg:gap-3">
          {NUMEROS.map((numero) => (
            <li key={numero.texto} className="rounded-[14px] border border-[#E2E7EA] px-3.5 py-3 lg:rounded-2xl lg:px-[18px] lg:py-4">
              <b className="block font-brand text-[26px] font-bold leading-none tracking-[-.025em] text-cobalt-500 lg:text-[34px]">
                {numero.valor}
              </b>
              <span className="mt-[7px] block text-[13px] leading-[1.35] text-slate-600 lg:text-[14.5px]">{numero.texto}</span>
            </li>
          ))}
        </ul>
        <a
          href={SIGNUP_URL}
          className={cn(
            "mt-5 inline-flex h-[58px] w-full items-center justify-center gap-3 whitespace-nowrap rounded-full bg-acid-500 px-[34px] text-[17px] font-bold hover:bg-[#B8FF5C] lg:mt-6 lg:w-auto",
            FOCO,
          )}
        >
          {CTA_TESTE}
          <ArrowRight aria-hidden className="size-5 shrink-0" />
        </a>
        <p className="mt-4 text-sm leading-normal text-[#33474F] lg:text-[15px]">
          Planos a partir de <b className="text-cobalt-500">{reais(MENOR_ANUAL)} por mês</b> no anual. Você cadastra o
          cartão, a cobrança só começa no 8º dia e dá pra cancelar quando quiser.
        </p>
      </div>
      <CartaoCampanha />
    </section>
  );
}
