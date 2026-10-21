// apps/web/src/components/painel/link-da-bio/guarda-de-saida.ts
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useConfirmacao } from "@/components/painel/confirmacao";
import { destinoInterno } from "@/lib/bio/editor";

/**
 * Sair com alteração não salva (spec §8): `beforeunload` (F5, fechar a aba, ir a outro site) e
 * clique em link interno interceptado na fase de CAPTURA, com a pergunta do `useConfirmacao`.
 *
 * Só `preventDefault`, sem `stopPropagation`: o clique continua até o React (a folha "Mais" fecha),
 * e o `<Link>` do Next não navega porque vê `defaultPrevented`. Confirmou → `router.push`.
 * Devolve a folha da pergunta, que a tela renderiza.
 */
export function useGuardaDeSaida(sujo: boolean): ReactNode {
  const router = useRouter();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();

  useEffect(() => {
    if (!sujo) return;

    const aoSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const aoClicar = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const destino = destinoInterno(
        {
          defaultPrevented: e.defaultPrevented,
          button: e.button,
          comModificador: e.ctrlKey || e.metaKey || e.shiftKey || e.altKey,
          alvo: a instanceof HTMLAnchorElement ? { href: a.href, target: a.target, download: a.hasAttribute("download") } : null,
        },
        window.location,
      );
      // Só caminho do próprio site: "//host" viraria URL de outro host no router.push.
      if (!destino || !destino.startsWith("/") || destino.startsWith("//")) return;
      e.preventDefault();
      void pedirConfirmacao({
        titulo: "Sair sem salvar?",
        texto: "As alterações do link da bio que você não salvou vão se perder.",
        rotulo: "Sair sem salvar",
        destrutivo: true,
      }).then((ok) => {
        if (ok) router.push(destino);
      });
    };

    window.addEventListener("beforeunload", aoSair);
    document.addEventListener("click", aoClicar, true);
    return () => {
      window.removeEventListener("beforeunload", aoSair);
      document.removeEventListener("click", aoClicar, true);
    };
  }, [sujo, pedirConfirmacao, router]);

  return folhaDeConfirmacao;
}
