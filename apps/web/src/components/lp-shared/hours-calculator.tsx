"use client";

import { useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { formatHoras, horasNaMao } from "@/components/lp-shared/horas";
import { cn } from "@/lib/utils";

type Variante = "piloto" | "atacado";
type Campo = "grupos" | "minutos" | "posts";

interface HoursCalculatorProps {
  variant: Variante;
  defaults: Record<Campo, number>;
  className?: string;
}

const CAMPOS: ReadonlyArray<{ chave: Campo; rotulo: string }> = [
  { chave: "grupos", rotulo: "Grupos" },
  { chave: "minutos", rotulo: "Minutos por grupo" },
  { chave: "posts", rotulo: "Posts por dia" },
];

const ESTILO: Record<
  Variante,
  { cartao: string; titulo: string; nota: string; resultado: string; numero: string; porDia: string }
> = {
  piloto: {
    cartao: "gap-3.5 rounded-[20px] p-5 lg:gap-5 lg:rounded-3xl lg:p-8",
    titulo: "Faça a conta com os seus números",
    nota: "Só copiando e colando. Com a Girumo, você posta uma vez e escolhe os grupos.",
    resultado: "border-t-[1.5px]",
    numero: "text-[44px] font-extrabold leading-[1.04] tracking-[-.03em] lg:text-[64px]",
    porDia: "font-bold",
  },
  atacado: {
    cartao: "gap-3 rounded-[20px] p-[18px] lg:gap-[18px] lg:rounded-3xl lg:border-2 lg:border-acid-500 lg:p-[30px]",
    titulo: "Faz a conta com a sua loja",
    nota: "Tempo que podia ir pro balcão, pra fornecedor e pra coleção nova.",
    resultado: "border-t-2",
    numero:
      "font-[family-name:var(--font-spartan)] text-[44px] font-black leading-none tracking-[-.02em] lg:text-[62px]",
    porDia: "font-extrabold",
  },
};

/**
 * "Quanto tempo você perde postando na mão": grupos × minutos × posts, ao vivo.
 * O botão leva ao formulário do herói (#comecar), não ao WhatsApp — quem fez a
 * conta ainda não respondeu as perguntas que qualificam a conversa.
 */
export function HoursCalculator({ variant, defaults, className }: HoursCalculatorProps) {
  const e = ESTILO[variant];
  const id = useId();
  const [valores, setValores] = useState<Record<Campo, string>>({
    grupos: String(defaults.grupos),
    minutos: String(defaults.minutos),
    posts: String(defaults.posts),
  });
  const tempo = horasNaMao(Number(valores.grupos), Number(valores.minutos), Number(valores.posts));

  return (
    <div
      role="group"
      aria-labelledby={`${id}-titulo`}
      className={cn("flex flex-col bg-paper-0 text-volt-950", e.cartao, className)}
    >
      {/* Some no celular como no mockup; continua nomeando o grupo para leitor de tela. */}
      <p id={`${id}-titulo`} className="hidden text-lg font-bold lg:block">
        {e.titulo}
      </p>
      <div className="grid grid-cols-3 gap-2 lg:gap-3">
        {CAMPOS.map(({ chave, rotulo }) => (
          <label key={chave} className="flex flex-col gap-1.5 text-xs font-bold lg:text-sm">
            {rotulo}
            <input
              id={`${id}-${chave}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={valores[chave]}
              onChange={(evento) => setValores((atual) => ({ ...atual, [chave]: evento.target.value }))}
              // mt-auto: rótulo que quebra em 2 linhas não desalinha os campos. Borda com 3:1 contra o branco.
              className="mt-auto h-12 w-full min-w-0 rounded-xl border-[1.5px] border-[#7C8A86] bg-white px-3 text-[17px] font-medium tabular-nums text-volt-950 focus:border-volt-950 focus:outline-2 focus:outline-offset-1 focus:outline-volt-950 lg:h-14 lg:px-4"
            />
          </label>
        ))}
      </div>
      <output
        htmlFor={CAMPOS.map(({ chave }) => `${id}-${chave}`).join(" ")}
        className={cn(
          "flex flex-col gap-1 border-volt-950 pt-3 lg:flex-row lg:flex-wrap lg:items-baseline lg:gap-x-3.5 lg:pt-[18px]",
          e.resultado,
        )}
      >
        <span className={cn("tabular-nums", e.numero)}>{formatHoras(tempo.horasPorDia)}</span>
        {/* O espaço de abertura some no flex, mas separa "2 horas" de "por dia" no texto que o leitor de tela anuncia. */}
        <span className={cn("text-[15px] lg:text-lg", e.porDia)}>
          {" "}
          por dia · {formatHoras(tempo.horasPorMes)} por mês na mão
        </span>
      </output>
      <p className="hidden text-[15px] leading-normal text-slate-600 lg:block">{e.nota}</p>
      <a
        href="#comecar"
        className="inline-flex min-h-[58px] items-center justify-center gap-2.5 rounded-full border-2 border-volt-950 bg-acid-500 px-5 text-center text-lg font-extrabold text-volt-950 shadow-[0_5px_0_#071923] transition-colors hover:bg-[#C4FF74] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt-950 lg:self-start lg:px-7"
      >
        Quero essas horas de volta
        {/* Sem seta no celular, como no mockup: com ela o texto quebra em 390 px. */}
        <ArrowRight aria-hidden className="hidden size-5 shrink-0 lg:block" />
      </a>
    </div>
  );
}
