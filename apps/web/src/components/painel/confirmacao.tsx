"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Folha } from "./folha";

type Pedido = {
  titulo: string;
  texto: string;
  /** Rótulo do botão que confirma. Diga o verbo, não "OK". */
  rotulo: string;
  /** Ação que não dá para desfazer: o botão vai em Danger. */
  destrutivo?: boolean;
};

type Aberto = Pedido & { resolver: (ok: boolean) => void };

/**
 * O `window.confirm` do painel, na paleta da Vitrine.
 *
 * O nativo trava o thread (e com ele a automação de teste — ver
 * `finding-window-confirm-congela-automacao`), não aceita rótulo por verbo e
 * ignora a identidade da tela. Aqui a pergunta vira `Folha`, que já tem Esc,
 * foco preso e raiz `inert`.
 *
 * Vem com `emQualquerLargura` porque TODO gatilho de confirmação vive num botão
 * que existe no desktop — sem isso o clique não produziria nada em telas
 * ≥1024px (o `lg:hidden` da folha mobile).
 *
 * ```tsx
 * const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
 * // ...
 * if (!(await pedirConfirmacao({ titulo, texto, rotulo }))) return;
 * // ...
 * return <>{folhaDeConfirmacao}</>;
 * ```
 */
export function useConfirmacao() {
  const [aberto, setAberto] = useState<Aberto | null>(null);
  // O estado é assíncrono: dois cliques rápidos chegariam aqui antes de a folha
  // montar e pôr a raiz em `inert`. A ref garante que o pedido anterior seja
  // recusado em vez de ficar pendente para sempre.
  const pendente = useRef<((ok: boolean) => void) | null>(null);

  const pedirConfirmacao = useCallback((pedido: Pedido) => {
    pendente.current?.(false);
    return new Promise<boolean>((resolve) => {
      pendente.current = resolve;
      setAberto({ ...pedido, resolver: resolve });
    });
  }, []);

  const responder = useCallback((ok: boolean) => {
    pendente.current?.(ok);
    pendente.current = null;
    setAberto(null);
  }, []);

  const folhaDeConfirmacao = (
    <Folha
      aberta={aberto !== null}
      aoFechar={() => responder(false)}
      titulo={aberto?.titulo ?? ""}
      testId="painel-confirmacao"
      emQualquerLargura
    >
      <p className="text-15 text-volt-950">{aberto?.texto}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-2 pb-2">
        <button
          type="button"
          onClick={() => responder(false)}
          className="min-h-11 rounded-[var(--radius-control)] border border-line-200 px-4 text-[15px] font-semibold text-volt-950 transition-colors hover:bg-canvas-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => responder(true)}
          className={cn(
            "min-h-11 rounded-[var(--radius-control)] border px-4 text-[15px] font-semibold transition-colors",
            aberto?.destrutivo
              ? "border-danger-700 text-danger-700 hover:bg-canvas-100"
              : "border-cobalt-500 bg-cobalt-500 text-paper-0 hover:brightness-95",
          )}
        >
          {aberto?.rotulo ?? "Confirmar"}
        </button>
      </div>
    </Folha>
  );

  return { pedirConfirmacao, folhaDeConfirmacao };
}
