"use client";

import { useCallback, useEffect, useRef } from "react";
import { atrasoComTeto } from "@/lib/ig/conversas/tela";

/**
 * Junta rajadas de eventos do Realtime numa recarga só: espera `esperaMs` sem evento novo, mas nunca mais de `tetoMs`
 * desde o primeiro da rajada. Com a aba escondida não busca nada: marca como velha e busca uma vez ao voltar.
 * Devolve `agendar`, estável.
 */
export function useRecargaAdiada(recarregar: () => void, esperaMs: number, tetoMs: number): () => void {
  const alvo = useRef(recarregar);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const primeiroEm = useRef<number | null>(null);
  const velha = useRef(false);
  useEffect(() => {
    alvo.current = recarregar;
  });

  const disparar = useCallback(() => {
    clearTimeout(timer.current);
    primeiroEm.current = null;
    alvo.current();
  }, []);

  const agendar = useCallback(() => {
    if (document.visibilityState === "hidden") {
      velha.current = true;
      return;
    }
    const agora = Date.now();
    primeiroEm.current ??= agora;
    clearTimeout(timer.current);
    timer.current = setTimeout(disparar, atrasoComTeto(primeiroEm.current, agora, esperaMs, tetoMs));
  }, [disparar, esperaMs, tetoMs]);

  useEffect(() => {
    const aoMudar = () => {
      if (document.visibilityState === "visible" && velha.current) {
        velha.current = false;
        disparar();
      }
    };
    document.addEventListener("visibilitychange", aoMudar);
    return () => {
      document.removeEventListener("visibilitychange", aoMudar);
      clearTimeout(timer.current);
    };
  }, [disparar]);

  return agendar;
}
