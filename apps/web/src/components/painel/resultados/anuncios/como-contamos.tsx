// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React from "react";

/**
 * "Como cada número é contado" (spec §1, mockup Regras): a regra única e o que
 * cada número da aba conta. `<details>` nativo: abre e fecha sem JavaScript e o
 * leitor de tela já anuncia o estado.
 */
const REGRAS: ReadonlyArray<readonly [string, string]> = [
  [
    "Cadastros",
    "Cadastros feitos no período, no site da loja e nas páginas da Girumo. O mesmo envio repetido conta uma vez.",
  ],
  [
    "Foram pro grupo",
    "Cadastros cujo link do grupo foi aberto. Cadastros das páginas da Girumo ainda não contam neste degrau.",
  ],
  [
    "Entraram",
    "Entradas no grupo cujo último cadastro da pessoa, até 7 dias antes, é deste anúncio. Pode passar de “foram pro grupo”: convite repassado e página da Girumo entram sem passar pelo link.",
  ],
  ["Já eram membros", "Cadastro feito por quem já estava no grupo. Não conta como entrada nova."],
  [
    "Compraram e vendido",
    "Pedidos cujo último cadastro da pessoa, até 90 dias antes, é deste anúncio. Um pedido nunca conta para dois anúncios.",
  ],
  [
    "Gasto e retorno",
    "Gasto lançado à mão por campanha, proporcional aos dias que caem no período. Retorno = vendido ÷ gasto.",
  ],
  [
    "Gráfico por dia",
    "Cada entrada aparece no dia em que aconteceu, só até o fim do período. O funil conta também quem entrou depois, então a soma do gráfico pode ficar abaixo do funil.",
  ],
  [
    "Fora dos anúncios",
    "Entradas e pedidos do período sem cadastro antes, pela data em que aconteceram. Não soma com o funil, que conta pela data do cadastro.",
  ],
];

export function ComoContamos() {
  return (
    <details className="rounded-xl border border-line-200 bg-paper-0">
      <summary className="flex min-h-11 cursor-pointer items-center px-5 text-15 font-semibold text-cobalt-500 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cobalt-500">
        Como cada número é contado
      </summary>
      <div className="border-t border-line-200 px-5 py-4">
        <p className="text-15 text-volt-950">
          Uma regra só: vale o último cadastro da pessoa antes de cada entrada ou pedido. Pessoa é o telefone (DDD
          + últimos 8 dígitos, com ou sem o nono dígito). O período escolhe os cadastros, e cada um é acompanhado até
          hoje.
        </p>
        <dl className="mt-3 divide-y divide-line-200">
          {REGRAS.map(([nome, regra]) => (
            <div key={nome} className="grid gap-1 py-2.5 sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="text-15 font-semibold text-volt-950">{nome}</dt>
              <dd className="text-15 text-slate-600">{regra}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
