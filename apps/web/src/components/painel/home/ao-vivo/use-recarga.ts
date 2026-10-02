"use client";

import { useEffect } from "react";

/**
 * Chama `recarregar` a cada `ms` enquanto a aba está visível, e uma vez assim que
 * ela volta a ficar visível. Aba escondida não busca nada (egress do Supabase).
 */
export function useRecarga(recarregar: () => void, ms: number) {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const ligar = () => {
      clearInterval(timer);
      if (document.visibilityState === "visible") timer = setInterval(recarregar, ms);
    };
    const aoMudar = () => {
      if (document.visibilityState === "visible") recarregar();
      ligar();
    };
    ligar();
    document.addEventListener("visibilitychange", aoMudar);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoMudar);
    };
  }, [recarregar, ms]);
}
