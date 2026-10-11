"use client";

import { useRef, useState } from "react";

import { encerrarSessaoDoAparelho } from "@/lib/supabase/encerrar-sessao";

export const MENSAGEM_DE_SAIDA_QUE_FALHOU = "Não deu pra sair agora. Confira a internet e toque em Sair de novo.";

/**
 * Estado do botão "Sair": vai para o /login só quando o servidor confirmou; senão fica na tela
 * com `falhou` para o aviso e pode tentar de novo. Dois toques seguidos fazem uma saída só.
 */
export function useSair() {
  const [saindo, setSaindo] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const emAndamento = useRef(false);

  async function sair() {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setSaindo(true);
    setFalhou(false);
    const ok = await encerrarSessaoDoAparelho().catch(() => false);
    if (ok) {
      // replace, não push: mata o GoTrueClient e o cache do router em memória e tira a entrada do histórico.
      window.location.replace("/login");
      return;
    }
    emAndamento.current = false;
    setSaindo(false);
    setFalhou(true);
  }

  return { sair, saindo, falhou };
}
