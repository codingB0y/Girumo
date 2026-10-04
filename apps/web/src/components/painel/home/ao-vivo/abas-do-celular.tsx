"use client";

import { useRef, type KeyboardEvent } from "react";
import { ABAS, type Aba, type ContadoresDasAbas } from "@/lib/painel/ao-vivo/abas";
import { cn } from "@/lib/utils";

const ROTULO: Record<Aba, string> = { relampago: "Relâmpago", postando: "Postando", grupos: "Grupos" };

type Props = { aba: Aba; contadores: ContadoresDasAbas; onEscolher: (aba: Aba) => void };

/**
 * As três seções da Início "Ao vivo" como abas, só abaixo de 768 px (a partir daí as três ficam
 * visíveis juntas). Padrão WAI-ARIA de abas: setas, Home e End movem o foco e escolhem a aba.
 */
export function AbasDoCelular({ aba, contadores, onEscolher }: Props) {
  const botoes = useRef<Partial<Record<Aba, HTMLButtonElement | null>>>({});

  function aoTeclar(e: KeyboardEvent, atual: Aba) {
    const i = ABAS.indexOf(atual);
    const destino =
      e.key === "ArrowRight" ? ABAS[(i + 1) % ABAS.length]
      : e.key === "ArrowLeft" ? ABAS[(i + ABAS.length - 1) % ABAS.length]
      : e.key === "Home" ? ABAS[0]
      : e.key === "End" ? ABAS[ABAS.length - 1]
      : null;
    if (!destino) return;
    e.preventDefault();
    onEscolher(destino);
    botoes.current[destino]?.focus();
  }

  return (
    <div role="tablist" aria-label="Seções da tela ao vivo" className="-mx-4 mb-2 grid grid-cols-3 border-b border-line-200 md:hidden">
      {ABAS.map((a) => {
        const ativa = a === aba;
        const contador = contadores[a];
        return (
          <button
            key={a}
            ref={(el) => {
              botoes.current[a] = el;
            }}
            type="button"
            role="tab"
            id={`aba-${a}`}
            aria-selected={ativa}
            aria-controls={`painel-${a}`}
            tabIndex={ativa ? 0 : -1}
            onClick={() => onEscolher(a)}
            onKeyDown={(e) => aoTeclar(e, a)}
            className={cn(
              "relative flex h-12 min-w-0 items-center justify-center gap-1.5 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cobalt-500",
              ativa
                ? "text-volt-950 after:absolute after:inset-x-3.5 after:-bottom-px after:h-0.5 after:rounded-t-sm after:bg-volt-950"
                : "text-slate-600",
            )}
          >
            {ROTULO[a]}
            {contador && (
              <span
                className={cn(
                  "tabular-nums",
                  // Pessoas esperando na fila: pílula neutra (mockup .f-count); os outros contadores seguem como texto.
                  a === "relampago" && contador !== "●"
                    ? "inline-grid h-[18px] min-w-5 place-items-center rounded-full bg-poco px-1.5 text-12 font-bold leading-none text-volt-950"
                    : "text-12 text-slate-600",
                )}
              >
                {contador === "●" ? (
                  <>
                    <span aria-hidden="true">●</span>
                    <span className="sr-only">no ar</span>
                  </>
                ) : (
                  <>
                    {contador}
                    {a === "relampago" && <span className="sr-only"> esperando</span>}
                  </>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
