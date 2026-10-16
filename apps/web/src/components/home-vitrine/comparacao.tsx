"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Alternador } from "@/components/home-shared/alternador";
import { plano, reais, type NomePlano } from "@/components/home-shared/home-data";
import { H2, MIOLO, TINTA, TOPO_CENTRO, TRILHO } from "@/components/home-vitrine/ui";
import { cn } from "@/lib/utils";

type Modo = "diferencas" | "tudo";
type Celula = string | boolean;

interface Linha {
  recurso: string;
  valores: readonly [essencial: Celula, growth: Celula, operacao: Celula];
}

const COLUNAS: readonly NomePlano[] = ["Essencial", "Growth", "Operação"];

/* O que muda de um plano pro outro (conferido em PLANS, lp3/landing-data). */
const DIFERENCAS: readonly Linha[] = [
  { recurso: "Celulares conectados", valores: ["1", "2", "2"] },
  { recurso: "Grupos", valores: ["até 5", "sem limite", "sem limite"] },
  { recurso: "Grupo lotou, o próximo nasce", valores: [false, true, true] },
  { recurso: "Página de captação com a sua marca", valores: [false, true, true] },
  { recurso: "Contatos: quem entrou e quem saiu", valores: [false, true, true] },
  { recurso: "Post que repete toda semana", valores: [false, true, true] },
  { recurso: "Venda com a origem", valores: [false, true, true] },
  { recurso: "Montagem junto com a gente", valores: [false, false, true] },
  { recurso: "Revisão mensal 1:1", valores: [false, false, true] },
  { recurso: "Prioridade no suporte", valores: [false, false, true] },
];

/* O que todo plano tem: só aparece em "Todos os detalhes", depois das diferenças,
   pra nenhuma linha mudar de lugar quando o seletor troca. */
const EM_TODOS: readonly Linha[] = [
  "Texto, foto e vídeo em todos os grupos",
  "Agenda dia e hora",
  "Aviso por e-mail se o celular desconectar",
  "Quem pede pra sair nunca é chamado de novo",
  "Só posta em grupo, nunca no privado",
  "Teste grátis de 7 dias",
].map((recurso) => ({ recurso, valores: [true, true, true] as const }));

const MENSAL: Linha = {
  recurso: "No mensal",
  valores: [reais(plano("Essencial").price), reais(plano("Growth").price), reais(plano("Operação").price)],
};

const MODOS = [
  { valor: "diferencas", texto: "Só as diferenças" },
  { valor: "tudo", texto: "Todos os detalhes" },
] as const;

function Valor({ valor }: { valor: Celula }) {
  if (typeof valor === "string") return <>{valor}</>;
  return valor ? (
    <>
      <Check aria-hidden strokeWidth={2.4} className="inline-block size-[18px] align-middle text-[#0C7346]" />
      <span className="sr-only">Incluso</span>
    </>
  ) : (
    <>
      <span aria-hidden className="text-[#84929A]">
        –
      </span>
      <span className="sr-only">Não incluso</span>
    </>
  );
}

/** Tabela dos três planos, com o seletor do mockup. Abre só nas diferenças. */
export function VitrineComparacao() {
  const [modo, setModo] = useState<Modo>("diferencas");
  const linhas = [...DIFERENCAS, ...(modo === "tudo" ? EM_TODOS : []), MENSAL];
  return (
    <section aria-labelledby="comparacao-titulo" className={cn(TINTA, "py-[60px] lg:py-24")}>
      <div className={cn(MIOLO, TOPO_CENTRO)}>
        <h2 id="comparacao-titulo" className={H2}>
          Compare os planos
        </h2>
        <Alternador rotulo="Mostrar" opcoes={MODOS} valor={modo} aoMudar={setModo} className={TRILHO} />
      </div>
      <div className={MIOLO}>
        <table className="mt-6 w-full border-separate border-spacing-0 overflow-hidden rounded-[20px] border border-[#E3EADF] bg-white text-[12.5px] lg:mt-9 lg:text-[14.5px]">
          <caption className="sr-only">Recursos de cada plano</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[38%] border-b border-[#EDF1EA] lg:w-[34%]">
                <span className="sr-only">Recurso</span>
              </th>
              {COLUNAS.map((nome) => (
                <th
                  key={nome}
                  scope="col"
                  className={cn(
                    "border-b border-[#EDF1EA] px-1.5 py-3.5 text-center font-brand text-[13.5px] font-bold lg:px-[22px] lg:py-5 lg:text-[17px]",
                    nome === "Growth" && "bg-[#EEF3FF] text-cobalt-700",
                  )}
                >
                  {nome}
                  <small className="mt-0.5 block font-body text-[11px] font-medium text-slate-600 lg:text-[13px]">
                    {reais(plano(nome).annualPrice)}/mês no anual
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => {
              const ultima = i === linhas.length - 1;
              const borda = ultima ? "" : "border-b border-[#EDF1EA]";
              return (
                <tr key={linha.recurso} className={i % 2 === 0 ? "bg-[#FAFCF8]" : undefined}>
                  <th scope="row" className={cn("py-2.5 pl-3 pr-1.5 text-left font-semibold text-[#2F434C] lg:px-[22px] lg:py-[15px]", borda)}>
                    {linha.recurso}
                  </th>
                  {linha.valores.map((valor, coluna) => (
                    <td
                      key={COLUNAS[coluna]}
                      className={cn("px-1.5 py-2.5 text-center lg:px-[22px] lg:py-[15px]", borda, coluna === 1 && "bg-[#F3F6FF]")}
                    >
                      <Valor valor={valor} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
