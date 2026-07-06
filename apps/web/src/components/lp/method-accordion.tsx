"use client";

import { useState } from "react";

/**
 * O método em 4 movimentos — acordeão horizontal (desktop) / vertical (mobile).
 * Contado como HISTÓRIA da operação Mega Stock, nunca como entregável.
 */
const MOVES = [
  {
    n: "01",
    title: "Captação constante",
    tag: "link no ar, grupo enchendo",
    body: "Link rastreado no anúncio, na bio e no story — apontando pra uma página simples que só faz uma coisa: colocar revendedor pra dentro do grupo. Lotou? O próximo já nasce e o link nunca morre.",
  },
  {
    n: "02",
    title: "Grupo aquecido",
    tag: "revendedor sente a loja viva",
    body: "Boas-vindas na hora, regra clara e novidade cedo. Grupo parado é grupo que sai; grupo com movimento diário vira o primeiro lugar onde o revendedor olha de manhã.",
  },
  {
    n: "03",
    title: "Oferta todo dia",
    tag: "grade nova na hora certa",
    body: "A grade nova ia pra todos os grupos de uma vez, no horário em que o revendedor tá montando o pedido. Quem viu cedo, pediu primeiro — e a reposição saía antes do estoque encalhar.",
  },
  {
    n: "04",
    title: "Evento de 2 dias",
    tag: "20 mil peças num fim de semana",
    body: "Duas vezes por ano, o estoque inteiro virava evento: aviso nos grupos, fila na porta do galpão e mais de 20 mil peças vendidas em 48 horas. O grupo era o canal que enchia o evento.",
  },
] as const;

export function MethodAccordion() {
  const [active, setActive] = useState(0);

  return (
    <div className="flex flex-col gap-3 md:h-[440px] md:flex-row">
      {MOVES.map((m, i) => {
        const isActive = active === i;
        return (
          <button
            key={m.n}
            type="button"
            aria-expanded={isActive}
            onClick={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            className="lp3-acc flex min-w-0 flex-col p-6 text-left md:p-7"
            data-active={isActive}
            style={{ flexGrow: isActive ? 3.2 : 1, flexBasis: 0 }}
          >
            <span className="lp3-acc-n text-5xl font-extrabold tracking-tight md:text-6xl" aria-hidden>
              {m.n}
            </span>
            <span className="mt-auto pt-6">
              <span className="block text-lg font-bold tracking-tight md:text-xl">{m.title}</span>
              <span className="lp3-acc-bodywrap">
                <span className="block overflow-hidden">
                  <span className="lp3-acc-body mt-3 block max-w-md text-sm leading-relaxed text-[var(--lp-muted)]">
                    {m.body}
                  </span>
                  <span className="lp3-mono mt-4 block text-[10px] text-[var(--lp-accent)]">{m.tag}</span>
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
