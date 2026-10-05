"use client";

import { useEffect, useState } from "react";
import { customLinkOrigin } from "@/lib/custom-domains/view";
import { authenticatedFetch } from "@/lib/supabase/client";

/**
 * Origem dos links públicos de campanha: `https://<domínio do lojista>` quando
 * ele está ativo, senão o host atual do painel.
 *
 * Começa VAZIA de propósito: quem monta o link com origem vazia não mostra nem
 * copia nada, então ninguém copia o link do host errado enquanto a consulta não
 * volta. Sem cache entre telas: uma consulta por montagem, para que troca de
 * conta (logout → login na mesma aba) e falha passageira não fiquem presas.
 */
export function useLinkOrigin(): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    let montado = true;
    authenticatedFetch("/api/dominio")
      .then((res) => (res.ok ? res.json() : null))
      .then(customLinkOrigin)
      .catch(() => null)
      .then((dominio) => {
        if (montado) setOrigin(dominio ?? window.location.origin);
      });
    return () => {
      montado = false;
    };
  }, []);
  return origin;
}
