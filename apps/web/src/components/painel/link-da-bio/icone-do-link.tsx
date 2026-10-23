// apps/web/src/components/painel/link-da-bio/icone-do-link.tsx
import React, { type ReactNode } from "react";

import type { Icone } from "@/lib/bio/documento";
import { cn } from "@/lib/utils";

/**
 * Os 13 ícones da lista fechada (spec §4), com os desenhos do sprite do mockup — os mesmos da
 * página pública: o ícone que a lojista escolhe aqui é o que aparece lá.
 */
const DESENHOS: Record<Icone, ReactNode> = {
  whatsapp: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.7.1 2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"
    />
  ),
  catalogo: (
    <>
      <path d="M2.5 5.5C5 4.2 8 4.3 12 6.2c4-1.9 7-2 9.5-.7V19c-2.5-1.3-5.5-1.2-9.5.7-4-1.9-7-2-9.5-.7z" />
      <path d="M12 6.2v13.5" />
    </>
  ),
  coroa: (
    <>
      <path d="M3.5 8.5l4.2 3.6L12 5l4.3 7.1 4.2-3.6-1.8 9.5H5.3z" />
      <path d="M5.5 20h13" />
    </>
  ),
  mapa: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <path d="M9.5 9.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0" />
    </>
  ),
  canal: (
    <>
      <path d="M4 10v4h3l6 4V6L7 10z" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  instagram: (
    <>
      <path d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3z" />
      <path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0" />
      <path d="M17.3 6.7h.01" />
    </>
  ),
  site: (
    <>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0" />
      <path d="M3.5 9h17M3.5 15h17" />
      <path d="M12 3c2.6 2.7 3.8 5.7 3.8 9s-1.2 6.3-3.8 9c-2.6-2.7-3.8-5.7-3.8-9S9.4 5.7 12 3z" />
    </>
  ),
  sacola: (
    <>
      <path d="M5 8h14l-1.2 12.5H6.2z" />
      <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </>
  ),
  etiqueta: (
    <>
      <path d="M3 12.2V4h8.2l9.3 9.3-8.2 8.2z" />
      <path d="M7.6 7.6h.01" />
    </>
  ),
  caminhao: (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
      <path d="M5.2 17.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0" />
      <path d="M15.2 17.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0" />
    </>
  ),
  video: (
    <>
      <path d="M4.5 6.5h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
      <path d="M15.5 10.5l6-3.5v10l-6-3.5" />
    </>
  ),
  cartao: (
    <>
      <path d="M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
};

export function IconeDoLink({ icone, className }: { icone: Icone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 flex-none", className)}
    >
      {DESENHOS[icone]}
    </svg>
  );
}

/** O quadradinho 40×40 da lista e dos atalhos (mockup): o verde do WhatsApp só no WhatsApp. */
export function QuadradoDoIcone({ icone, apagado = false }: { icone: Icone; apagado?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-10 w-10 flex-none place-items-center rounded-[10px]",
        icone === "whatsapp" ? "bg-zap text-paper-0" : "bg-canvas-100 text-volt-950",
        apagado && "opacity-55",
      )}
    >
      <IconeDoLink icone={icone} />
    </span>
  );
}
