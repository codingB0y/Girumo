"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/supabase/client";

/**
 * Segmento (ramo) do tenant, para o cliente escolher o pack de conteúdo.
 *
 * `undefined` = ainda carregando (a tela decide se mostra skeleton);
 * `null` = sem segmento → pack neutro. Falha de rede também vira `null`:
 * biblioteca neutra é melhor que biblioteca nenhuma.
 */
export function useTenantSegment(): string | null | undefined {
  const [segment, setSegment] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let ativo = true;
    authenticatedFetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (ativo) setSegment(typeof d?.segment === "string" ? d.segment : null);
      })
      .catch(() => {
        if (ativo) setSegment(null);
      });
    return () => {
      ativo = false;
    };
  }, []);

  return segment;
}
