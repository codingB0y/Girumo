"use client";

import { useId, useState } from "react";
import { ChartColumn, Clock, Minus, Plus, Send, type LucideIcon } from "lucide-react";
import { plano } from "@/components/home-shared/home-data";
import {
  ajustar,
  custoPorDia,
  horaQueFechaConta,
  minutosNaMao,
  tempoPorExtenso,
  type Limite,
  type Rotina,
} from "@/components/home-produto/calculo";
import { BotaoTeste, FOCO, H2, MIOLO } from "@/components/home-produto/ui";
import { cn } from "@/lib/utils";

/** O exemplo com que a calculadora abre — e que o texto ao lado usa. */
const EXEMPLO: Rotina = { grupos: 20, posts: 2, minutos: 1, dias: 30 };

const PERIODOS = [
  { dias: 1, texto: "1 dia", frase: "em 1 dia" },
  { dias: 7, texto: "1 semana", frase: "em 1 semana" },
  { dias: 30, texto: "1 mês", frase: "em 1 mês" },
] as const;

interface Contador {
  campo: "grupos" | "posts" | "minutos";
  rotulo: string;
  limite: Limite;
  menos: string;
  mais: string;
}

const CONTADORES: readonly Contador[] = [
  { campo: "grupos", rotulo: "Grupos", limite: [1, 200], menos: "Menos um grupo", mais: "Mais um grupo" },
  { campo: "posts", rotulo: "Posts por dia", limite: [1, 20], menos: "Menos um post", mais: "Mais um post" },
  { campo: "minutos", rotulo: "Minutos por post, em cada grupo", limite: [1, 10], menos: "Menos um minuto", mais: "Mais um minuto" },
];

const BOTAO_PASSO = "grid size-[34px] place-items-center rounded-lg text-[#3B4D56] hover:bg-white disabled:opacity-40";

function Calculadora() {
  const [rotina, setRotina] = useState<Rotina>(EXEMPLO);
  const id = useId();
  const periodo = PERIODOS.find((p) => p.dias === rotina.dias) ?? PERIODOS[2];
  const mudar = (campo: Contador["campo"], passo: number, limite: Limite) =>
    setRotina((atual) => ({ ...atual, [campo]: ajustar(atual[campo], passo, limite) }));

  return (
    <div className="rounded-[20px] bg-white px-[18px] pb-[18px] pt-[22px] shadow-[0_30px_60px_-32px_rgba(7,25,35,.32),0_0_0_1px_#E6EBF2] lg:px-[26px] lg:pb-[22px] lg:pt-[26px]">
      {CONTADORES.map(({ campo, rotulo, limite, menos, mais }, i) => (
        <div key={campo} className={i > 0 ? "mt-3.5" : undefined}>
          <p id={`${id}-${campo}`} className="mb-1.5 text-[13px] text-slate-600">
            {rotulo}
          </p>
          <div role="group" aria-labelledby={`${id}-${campo}`} className="flex h-12 items-center rounded-xl bg-[#F5F7F9] pl-4 pr-2">
            <span className="flex-1 text-base font-semibold tabular-nums">
              {rotina[campo]}
            </span>
            <button
              type="button"
              aria-label={menos}
              disabled={rotina[campo] <= limite[0]}
              onClick={() => mudar(campo, -1, limite)}
              className={cn(BOTAO_PASSO, FOCO)}
            >
              <Minus aria-hidden className="size-[18px]" />
            </button>
            <button
              type="button"
              aria-label={mais}
              disabled={rotina[campo] >= limite[1]}
              onClick={() => mudar(campo, 1, limite)}
              className={cn(BOTAO_PASSO, FOCO)}
            >
              <Plus aria-hidden className="size-[18px]" />
            </button>
          </div>
        </div>
      ))}
      <p id={`${id}-periodo`} className="mb-1.5 mt-3.5 text-[13px] text-slate-600">
        Período
      </p>
      <div role="group" aria-labelledby={`${id}-periodo`} className="grid grid-cols-3 gap-1.5">
        {PERIODOS.map((p) => {
          const ligado = p.dias === rotina.dias;
          return (
            <button
              key={p.dias}
              type="button"
              aria-pressed={ligado}
              onClick={() => setRotina((atual) => ({ ...atual, dias: p.dias }))}
              className={cn(
                "grid h-11 place-items-center rounded-[10px] text-sm font-semibold",
                ligado ? "border-2 border-cobalt-500 text-cobalt-700" : "border border-[#E1E6EA] text-slate-600",
                FOCO,
              )}
            >
              {p.texto}
            </button>
          );
        })}
      </div>
      {/* <output> já é região viva: cada + ou − anuncia o novo total. */}
      <output className="mt-5 block border-t border-[#E2E7EA] pt-[18px]">
        <small className="block text-[13.5px] text-slate-600">Na mão, {periodo.frase}, a loja gasta</small>
        <b className="mt-1 block font-brand text-[40px] font-bold tracking-[-.02em] text-cobalt-500">
          {tempoPorExtenso(minutosNaMao(rotina))}
        </b>
        <span className="mt-1 block text-sm text-slate-600">
          Com a Girumo, cada post é escrito uma vez, não {rotina.grupos}.
        </span>
      </output>
    </div>
  );
}

/** "Quanto tempo a loja gasta postando na mão?": a conta ao lado da calculadora. */
export function ProdutoCalculadora() {
  const growth = plano("Growth").price;
  const minutosPorDia = minutosNaMao({ ...EXEMPLO, dias: 1 });
  const linhas: ReadonlyArray<{ icone: LucideIcon; titulo: string; texto: string }> = [
    {
      icone: Clock,
      titulo: "A conta de verdade",
      texto: `${EXEMPLO.grupos} grupos, ${EXEMPLO.posts} posts por dia, ${EXEMPLO.minutos} minuto em cada: ${tempoPorExtenso(minutosPorDia)} por dia, todo dia.`,
    },
    {
      icone: Send,
      titulo: "Com a Girumo, uma vez só",
      texto: "Você escreve o post uma vez e a Girumo entrega grupo por grupo.",
    },
    {
      icone: ChartColumn,
      titulo: `${custoPorDia(growth)} por dia`,
      texto: `É quanto custa o Growth no mensal. Se a hora de quem posta vale mais de R$ ${horaQueFechaConta(growth, minutosNaMao(EXEMPLO))}, a conta fecha.`,
    },
  ];
  return (
    <section aria-labelledby="calculadora-titulo" className="py-[60px] lg:py-[100px]">
      <div className={cn(MIOLO, "grid items-center gap-[34px] lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-[84px]")}>
        <div>
          <h2 id="calculadora-titulo" className={H2}>
            Quanto tempo a loja gasta postando na mão?
          </h2>
          <ul className="mb-7 mt-[26px]">
            {linhas.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="flex gap-4 border-b border-[#E2E7EA] py-[18px] last:border-b-0">
                <Icone aria-hidden className="mt-0.5 size-[22px] shrink-0 text-cobalt-500" />
                <div>
                  <b className="block text-base font-bold">{titulo}</b>
                  <span className="mt-1 block text-[15px] leading-normal text-slate-600">{texto}</span>
                </div>
              </li>
            ))}
          </ul>
          <BotaoTeste />
        </div>
        <Calculadora />
      </div>
    </section>
  );
}
