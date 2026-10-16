import type { ReactNode } from "react";
import { FOCO } from "@/components/home-shared/estilo";
import { cn } from "@/lib/utils";

interface AlternadorProps<T extends string> {
  /** Nome do grupo pro leitor de tela ("Período", "Mostrar"). */
  rotulo: string;
  opcoes: ReadonlyArray<{ valor: T; texto: ReactNode }>;
  valor: T;
  aoMudar: (valor: T) => void;
  /** Fundo e posição do trilho (cada home tem o seu). */
  className?: string;
}

/** Seletor de duas posições em pílula. Só pra componente de cliente. */
export function Alternador<T extends string>({ rotulo, opcoes, valor, aoMudar, className }: AlternadorProps<T>) {
  return (
    <div role="group" aria-label={rotulo} className={cn("flex w-max gap-1 rounded-full p-[5px]", className)}>
      {opcoes.map((opcao) => {
        const ligado = opcao.valor === valor;
        return (
          <button
            key={opcao.valor}
            type="button"
            aria-pressed={ligado}
            onClick={() => aoMudar(opcao.valor)}
            className={cn(
              "flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-semibold lg:px-[18px] lg:text-[14.5px]",
              ligado ? "bg-volt-950 text-white" : "text-slate-600 hover:text-volt-950",
              FOCO,
            )}
          >
            {opcao.texto}
          </button>
        );
      })}
    </div>
  );
}
