import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { SIGNUP_URL } from "@/components/lp3/landing-data";
import { HOME_FAQ, IMG } from "@/components/home-shared/home-data";
import { Navegador } from "@/components/home-shared/frames";
import { BOTAO, FOCO, MIOLO, TINTA } from "@/components/home-vitrine/ui";
import { cn } from "@/lib/utils";

/** Perguntas em sanfona nativa (<details>), a primeira aberta. */
export function VitrineDuvidas() {
  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className="scroll-mt-4 py-[60px] lg:py-24">
      <div className={MIOLO}>
        <h2 id="duvidas-titulo" className="text-center font-brand text-[28px] font-normal tracking-[-.02em] lg:text-[40px]">
          Ficou com dúvida? <b className="font-extrabold text-cobalt-500">A gente explica.</b>
        </h2>
        <div className="mx-auto mt-9 max-w-[900px]">
          {HOME_FAQ.map(([pergunta, resposta], i) => (
            <details key={pergunta} open={i === 0} className="group border-b border-[#E1E7EA]">
              <summary
                className={cn(
                  "flex min-h-[62px] cursor-pointer list-none items-center justify-between gap-4 rounded-md text-[16.5px] text-[#2F434C] group-open:font-semibold [&::-webkit-details-marker]:hidden",
                  FOCO,
                )}
              >
                {pergunta}
                <ChevronDown aria-hidden className="size-5 shrink-0 text-slate-600 transition-transform group-open:rotate-180" />
              </summary>
              <p className="max-w-[48em] pb-5 text-[15.5px] leading-relaxed text-[#4A5E68]">{resposta}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

const GARANTIAS = [
  "Tudo liberado por 7 dias",
  "Cancela antes do 8º dia e não paga nada",
  "Seu número de sempre, sem chip novo",
] as const;

/**
 * Fecho com o painel ao lado. No mockup era um formulário de e-mail e senha; aqui
 * é um cartão que leva ao /signup, que é onde a conta nasce de verdade (o
 * cadastro não lê e-mail da URL, e formulário de mentira seria pior).
 */
export function VitrineCadastro() {
  return (
    <section aria-labelledby="cadastro-titulo" className={cn(TINTA, "py-[60px] lg:py-24")}>
      <div className={cn(MIOLO, "grid gap-4 lg:grid-cols-[430px_minmax(0,1fr)]")}>
        <div className="flex flex-col justify-center rounded-3xl border border-[#E3EADF] bg-white px-5 py-[26px] lg:px-[34px] lg:pb-[30px] lg:pt-9">
          <h2 id="cadastro-titulo" className="font-brand text-[32px] font-semibold leading-[1.15] tracking-[-.02em]">
            Crie sua conta e <em className="whitespace-nowrap not-italic text-cobalt-500">teste 7 dias</em>
          </h2>
          <p className="mt-2.5 text-[15px] leading-normal text-slate-600">
            Depois é ler o QR Code com o número de sempre e agendar o primeiro post.
          </p>
          <ul className="mt-5 grid gap-3">
            {GARANTIAS.map((garantia) => (
              <li key={garantia} className="flex items-center gap-3 text-[15px] font-semibold">
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-acid-500">
                  <Check strokeWidth={2.6} className="size-3.5" />
                </span>
                {garantia}
              </li>
            ))}
          </ul>
          <a href={SIGNUP_URL} className={cn(BOTAO, "mt-6 h-[52px] lg:w-full", FOCO)}>
            Criar minha conta
            <ArrowRight aria-hidden className="size-[18px] shrink-0" />
          </a>
          <p className="mt-3.5 text-center text-[13px] text-slate-600">Você cadastra o cartão e só paga no 8º dia.</p>
        </div>
        <div aria-hidden className="relative min-h-[300px] overflow-hidden rounded-3xl border border-[#E3EADF] bg-white lg:min-h-[520px]">
          <Navegador
            img={IMG.campanhaDesktop}
            alt=""
            endereco="app.girumo.com.br/painel/campanhas"
            className="absolute left-4 top-5 w-[600px] lg:left-10 lg:top-10 lg:w-[820px]"
          />
        </div>
      </div>
    </section>
  );
}
