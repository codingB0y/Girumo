"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * O link como a Vitrine mostra: o caminho curto na tela, a URL inteira só no
 * clique (regra 5 da spec — a lista nunca carrega a URL completa, que rouba a
 * linha inteira e não é lida por ninguém).
 *
 * Difere do `copy-link.tsx` da casca antiga, que exibe o `url` que copia.
 */
export function CopiarLinkVitrine({
  rotulo,
  url,
  descricao,
  className,
}: {
  /** O que aparece: "/r/reativacao". */
  rotulo: string;
  /** O que vai para a área de transferência: a URL inteira. */
  url: string;
  /** Nome acessível do botão, já que "Copiar" sozinho se repete na lista. */
  descricao: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sem isso, copiar e sair da tela agenda um setState em componente morto.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copiar(evento: React.MouseEvent) {
    // A etiqueta inteira é um link para o detalhe; copiar não pode navegar.
    evento.preventDefault();
    evento.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* área de transferência bloqueada — o caminho segue visível na tela */
    }
  }

  return (
    <span className={cn("relative z-10 inline-flex items-center gap-2", className)}>
      <span className="font-data truncate text-13 text-cobalt-500">{rotulo}</span>
      <button
        type="button"
        onClick={copiar}
        aria-label={descricao}
        className="inline-flex h-8 min-w-8 items-center gap-1 rounded-[var(--radius-chip)] border border-line-200 px-2 text-12 text-volt-950 transition-colors hover:bg-canvas-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      >
        {copiado ? (
          <Check className="h-3.5 w-3.5 text-sucesso" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="font-data">{copiado ? "Copiado" : "Copiar"}</span>
      </button>
    </span>
  );
}
