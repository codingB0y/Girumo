"use client";

import { useRef, useState } from "react";

/**
 * `pn-carimbo-evento` (spec 3.4) entra uma vez por evento real — o grupo que
 * lota, o disparo que termina — não a cada render da lista. Vira `true` na
 * transição de `false` para `true` de `atual` e fica assim; a chamadora ainda
 * decide se o estado atual pede o visual de carimbo (ex.: o grupo pode sair
 * de "cheio" depois).
 */
export function useCarimboEvento(atual: boolean): boolean {
  const anteriorRef = useRef(atual);
  const [carimbou, setCarimbou] = useState(false);
  if (anteriorRef.current !== atual) {
    if (!anteriorRef.current && atual) setCarimbou(true);
    anteriorRef.current = atual;
  }
  return carimbou;
}
