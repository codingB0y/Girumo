"use client";

import { useEffect, useState } from "react";
import { customLinkOrigin } from "@/lib/custom-domains/view";
import { authenticatedFetch } from "@/lib/supabase/client";

let pedido: Promise<string | null> | null = null;

function origemDoDominio(): Promise<string | null> {
  // Uma consulta por carga do painel: lista, detalhe e criação montam o hook.
  pedido ??= authenticatedFetch("/api/dominio")
    .then((res) => (res.ok ? res.json() : null))
    .then(customLinkOrigin)
    .catch(() => null);
  return pedido;
}

/** Esquece a origem lida — o cartão de domínio chama ao conectar, ativar ou remover. */
export function esquecerOrigemDoDominio(): void {
  pedido = null;
}

/**
 * Origem dos links públicos de campanha: `https://<domínio do lojista>` quando
 * ele está ativo, senão o host atual do painel.
 *
 * Começa VAZIA de propósito: `linkPublico` e companhia devolvem `null` para
 * origem vazia, então ninguém copia o link do host errado enquanto a consulta
 * não volta.
 */
export function useLinkOrigin(): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    let montado = true;
    void origemDoDominio().then((dominio) => {
      if (montado) setOrigin(dominio ?? window.location.origin);
    });
    return () => {
      montado = false;
    };
  }, []);
  return origin;
}
