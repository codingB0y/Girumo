"use client";

import { useEffect, useState } from "react";

/** Abaixo de 1024 px (o `lg` do Tailwind) a tela vira lista → conversa em tela cheia. Falso até o navegador responder. */
export function useCelular(): boolean {
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia("(max-width: 1023px)");
    const atualizar = () => setCelular(consulta.matches);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);
  return celular;
}
