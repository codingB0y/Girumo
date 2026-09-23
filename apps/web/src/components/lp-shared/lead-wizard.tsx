"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Lock, MapPin } from "lucide-react";
import { WhatsAppIcon } from "@/components/landing/icons";
import { WHATSAPP_URL } from "@/components/lp3/landing-data";
import {
  buildLeadMessage,
  limpaNome,
  PERGUNTA_LOJA,
  withWhatsAppText,
  type LeadStep,
} from "@/components/lp-shared/lead-message";
import type { LpVariant } from "@/components/lp-shared/lp-data";
import { cn } from "@/lib/utils";

interface EstiloWizard {
  cartao: string;
  titulo: string;
  subtitulo: string;
  cabecalho: string;
  legenda: string;
  grade: string;
  opcao: string;
  opcaoLivre: string;
  opcaoEscolhida: string;
  botaoFinal: string;
}

const OPCAO_CLARA_LIVRE = "border-[#C9CCC4] bg-white hover:border-volt-950 hover:bg-[#F7FFE9]";
const OPCAO_CLARA_ESCOLHIDA = "border-volt-950 bg-acid-500";
const PILULA_ESCURA =
  "inline-flex min-h-[58px] w-full items-center justify-center gap-2.5 rounded-full border-2 border-volt-950 bg-volt-950 px-5 text-center text-lg font-extrabold text-paper-0 transition-colors hover:bg-volt-800 lg:px-7";

const ESTILO: Record<LpVariant, EstiloWizard> = {
  cartaz: {
    cartao:
      "gap-2.5 rounded-[14px] border-[1.5px] border-volt-950 bg-white p-4 text-volt-950 shadow-[0_5px_0_#071923] lg:gap-3 lg:px-6 lg:py-[22px] lg:shadow-[0_6px_0_#071923]",
    titulo:
      "font-[family-name:var(--font-cartaz)] text-[32px] font-black leading-[.9] [font-stretch:68%] lg:text-[40px]",
    subtitulo: "mt-2 text-[15px] leading-[1.45] text-slate-600 lg:text-base",
    cabecalho: "text-xs font-bold lg:text-sm",
    legenda:
      "font-[family-name:var(--font-cartaz)] text-[28px] font-black leading-[.9] tracking-[-.005em] [font-stretch:68%] lg:text-[32px]",
    grade: "mt-2.5 gap-2 lg:mt-3 lg:gap-2.5",
    opcao: "min-h-[52px] rounded-[10px] border-volt-950 text-[15px] lg:min-h-[60px] lg:text-[17px]",
    opcaoLivre: "bg-white hover:bg-[#F2FFE0]",
    opcaoEscolhida: "bg-acid-500",
    botaoFinal:
      "inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-[10px] bg-volt-950 px-4 text-center text-lg font-extrabold uppercase tracking-[.015em] text-paper-0 [font-stretch:75%] transition-colors hover:bg-volt-800 lg:min-h-[60px] lg:px-7 lg:text-[21px]",
  },
  piloto: {
    cartao:
      "gap-3.5 rounded-[20px] bg-white p-5 text-volt-950 shadow-[0_1px_2px_rgba(7,25,35,.06),0_12px_32px_rgba(7,25,35,.08)] lg:gap-[18px] lg:p-8",
    titulo: "text-2xl font-extrabold leading-[1.04] tracking-[-.03em] lg:text-[30px]",
    subtitulo: "mt-2 text-[15px] leading-[1.45] text-slate-600 lg:text-base",
    cabecalho: "text-xs font-bold lg:text-[13px]",
    legenda: "text-lg font-extrabold leading-snug lg:text-xl",
    grade: "mt-3 gap-2.5 lg:gap-3",
    opcao: "min-h-14 rounded-[14px] text-base lg:min-h-[60px] lg:text-[17px]",
    opcaoLivre: OPCAO_CLARA_LIVRE,
    opcaoEscolhida: OPCAO_CLARA_ESCOLHIDA,
    botaoFinal: `${PILULA_ESCURA} shadow-[0_5px_0_#071923]`,
  },
  atacado: {
    cartao:
      "gap-3 rounded-[20px] border-2 border-volt-950 bg-white p-[18px] text-volt-950 shadow-[0_6px_0_#071923] lg:gap-3.5 lg:rounded-[22px] lg:p-6 lg:shadow-[0_8px_0_#071923]",
    titulo:
      "font-[family-name:var(--font-spartan)] text-[26px] font-black leading-none tracking-[-.02em] lg:text-[32px]",
    subtitulo: "mt-2 text-[15px] font-medium leading-[1.45] text-slate-600 lg:text-base",
    cabecalho: "text-xs font-extrabold lg:text-[13px]",
    legenda: "text-lg font-extrabold leading-snug lg:text-xl",
    grade: "mt-2.5 gap-2 lg:mt-3 lg:gap-2.5",
    opcao: "min-h-[54px] rounded-[14px] text-[15px] lg:min-h-[60px] lg:text-[17px]",
    opcaoLivre: OPCAO_CLARA_LIVRE,
    opcaoEscolhida: OPCAO_CLARA_ESCOLHIDA,
    botaoFinal: PILULA_ESCURA,
  },
};

const TOTAL_PASSOS = 3;
const LARGURA_PROGRESSO = ["w-1/3", "w-2/3", "w-full"] as const;
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt-950";

type Passo = 0 | 1 | 2;
type Respostas = readonly [number | null, number | null];

interface LeadWizardProps {
  variant: LpVariant;
  steps: readonly [LeadStep, LeadStep];
  title?: string;
  subtitle?: string;
  className?: string;
}

/**
 * Formulário "Veja funcionando" das landings: duas perguntas de um clique e o
 * nome. Não grava nada — termina abrindo o WhatsApp de vendas com a mensagem já
 * escrita (ver lead-message.ts). Cada instância começa no passo 1, então o do
 * fim da página recomeça do zero.
 */
export function LeadWizard({ variant, steps, title, subtitle, className }: LeadWizardProps) {
  const e = ESTILO[variant];
  const id = useId();
  const tituloPassoId = `${id}-passo`;
  const tituloFormId = `${id}-titulo`;
  const nomeId = `${id}-nome`;
  const erroId = `${id}-erro`;

  const [passo, setPasso] = useState<Passo>(0);
  const [respostas, setRespostas] = useState<Respostas>([null, null]);
  const [nome, setNome] = useState("");
  const [faltaNome, setFaltaNome] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  // Só move o foco depois de a pessoa navegar: no carregamento da página o foco
  // não pode pular para o formulário (são duas instâncias por página).
  const navegou = useRef(false);

  useEffect(() => {
    if (navegou.current) document.getElementById(tituloPassoId)?.focus();
  }, [passo, tituloPassoId]);

  function irPara(destino: Passo) {
    navegou.current = true;
    setFaltaNome(false);
    setPasso(destino);
  }

  function escolher(indice: number) {
    if (passo === 2) return;
    setRespostas((atual) => (passo === 0 ? [indice, atual[1]] : [atual[0], indice]));
    irPara(passo === 0 ? 1 : 2);
  }

  const frases = steps.map((pergunta, i) => {
    const escolhida = respostas[i];
    return escolhida === null ? "" : (pergunta.options[escolhida]?.phrase ?? "");
  });
  const nomeValido = limpaNome(nome) !== "";
  const whatsappComMensagem = withWhatsAppText(WHATSAPP_URL, buildLeadMessage(nome, frases));

  function abrirWhatsApp(evento: MouseEvent<HTMLAnchorElement>) {
    if (nomeValido) return;
    evento.preventDefault();
    setFaltaNome(true);
    nomeRef.current?.focus();
  }

  // Enter no campo do nome: o form não tem botão de envio, então o Enter vira
  // clique no link — que passa pela mesma validação e pelo rastreio de saída.
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (passo === 2) linkRef.current?.click();
  }

  const rotuloPasso = `${title ? "Passo" : "Veja funcionando · passo"} ${passo + 1} de ${TOTAL_PASSOS}`;
  const pergunta = passo === 2 ? null : steps[passo];
  const respostaAtual = passo === 2 ? null : respostas[passo];
  // Compara pelo texto, não pela referência: `steps` chega de um server component
  // e atravessa a fronteira serializado — é uma cópia, nunca o mesmo objeto.
  const comPino = pergunta?.legend === PERGUNTA_LOJA.legend && variant !== "piloto";

  return (
    <form
      noValidate
      onSubmit={enviar}
      aria-labelledby={title ? tituloFormId : undefined}
      className={cn("flex flex-col", e.cartao, className)}
    >
      {/* Título só a partir de lg, como nos mockups: no celular o cartão começa no
          passo, pra as opções caberem na 1ª tela. O form continua nomeado por ele. */}
      {(title || subtitle) && (
        <div className="hidden lg:block">
          {title && (
            <h2 id={tituloFormId} className={e.titulo}>
              {title}
            </h2>
          )}
          {subtitle && <p className={e.subtitulo}>{subtitle}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className={cn("flex items-center justify-between gap-3", e.cabecalho)}>
          <span aria-live="polite">{rotuloPasso}</span>
          {passo === 0 ? (
            <span className="shrink-0 text-slate-600">
              <span className="lg:hidden">20 segundos</span>
              <span className="hidden lg:inline">leva 20 segundos</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => irPara(passo === 2 ? 1 : 0)}
              className={cn(
                "-my-3 -mr-2 inline-flex min-h-11 shrink-0 items-center px-2 underline decoration-2 underline-offset-4",
                FOCO,
              )}
            >
              Voltar
            </button>
          )}
        </div>
        <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-[#E4E6DE]">
          <div
            className={cn(
              "h-full rounded-full bg-volt-950 transition-[width] duration-300 motion-reduce:transition-none",
              LARGURA_PROGRESSO[passo],
            )}
          />
        </div>
      </div>

      {pergunta ? (
        <>
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend id={tituloPassoId} tabIndex={-1} className={cn("p-0 outline-none", e.legenda)}>
              {pergunta.legend}
            </legend>
            <div className={cn("grid grid-cols-2", e.grade)}>
              {pergunta.options.map((opcao, indice) => {
                const escolhida = respostaAtual === indice;
                return (
                  <button
                    key={opcao.label}
                    type="button"
                    aria-pressed={escolhida}
                    onClick={() => escolher(indice)}
                    className={cn(
                      "flex items-center justify-center gap-2.5 border-[1.5px] px-3 text-center font-bold leading-tight text-volt-950 transition-colors lg:px-3.5",
                      e.opcao,
                      escolhida ? e.opcaoEscolhida : e.opcaoLivre,
                      comPino && "lg:justify-start lg:text-left",
                      FOCO,
                    )}
                  >
                    {comPino && <MapPin aria-hidden className="hidden size-[18px] shrink-0 lg:block" />}
                    {opcao.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 lg:gap-2 lg:text-sm">
              <Lock aria-hidden className="size-3.5 shrink-0 lg:size-[15px]" />
              Sem compromisso.
            </p>
            <a
              href={WHATSAPP_URL}
              data-outbound="whatsapp_click"
              className={cn(
                "inline-flex min-h-11 items-center gap-2 text-sm font-bold underline decoration-2 underline-offset-4 lg:text-[15px]",
                FOCO,
              )}
            >
              <WhatsAppIcon className="size-4 shrink-0 lg:size-[18px]" />
              Prefiro chamar no WhatsApp
            </a>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p id={tituloPassoId} tabIndex={-1} className={cn("outline-none", e.legenda)}>
            Como a gente te chama?
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nomeId} className="text-sm font-bold">
              Seu nome
            </label>
            <input
              ref={nomeRef}
              id={nomeId}
              name="nome"
              type="text"
              autoComplete="given-name"
              enterKeyHint="go"
              required
              value={nome}
              onChange={(evento) => {
                setNome(evento.target.value);
                if (faltaNome) setFaltaNome(false);
              }}
              aria-invalid={faltaNome || undefined}
              aria-describedby={faltaNome ? erroId : undefined}
              // Borda #7C8A86 e não o #9AA39F do mockup: campo vazio precisa de 3:1 contra o branco pra ser achado.
              className="h-14 w-full rounded-xl border-[1.5px] border-[#7C8A86] bg-white px-4 text-[17px] font-medium text-volt-950 focus:border-volt-950 focus:outline-2 focus:outline-offset-1 focus:outline-volt-950"
            />
            {faltaNome && (
              <p id={erroId} className="text-sm font-semibold text-danger-700">
                Escreva o seu nome pra gente saber com quem fala.
              </p>
            )}
          </div>
          <a
            ref={linkRef}
            href={whatsappComMensagem}
            // Sem nome o clique não navega; sem o atributo, o OutboundTracker não conta um clique que não abriu nada.
            data-outbound={nomeValido ? "whatsapp_click" : undefined}
            onClick={abrirWhatsApp}
            className={cn(e.botaoFinal, FOCO)}
          >
            <WhatsAppIcon className="size-5 shrink-0 text-acid-500 lg:size-[22px]" />
            Quero ver funcionando
          </a>
          <p className="text-[13px] leading-[1.45] text-slate-600">
            Abre o WhatsApp com a sua mensagem pronta. É só enviar.
          </p>
        </div>
      )}
    </form>
  );
}
