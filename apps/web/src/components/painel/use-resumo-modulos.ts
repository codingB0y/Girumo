"use client";

import { useEffect, useState } from "react";
import type { ResumoDados } from "@/lib/painel-nav";

type Linha = { status?: string; enabled?: boolean; createdAt?: string };

/** Aceita lista pura ou envelope ({ offers: [...] }, como /api/relampago/offers). */
async function lista(url: string): Promise<Linha[]> {
  const r = await fetch(url).then((res) => (res.ok ? res.json() : [])).catch(() => []);
  if (Array.isArray(r)) return r;
  const envelope = r && typeof r === "object" ? Object.values(r).find(Array.isArray) : undefined;
  return Array.isArray(envelope) ? envelope : [];
}

/** O estado de cada módulo ("Campanhas · 3"). Busca só enquanto `aberto`. */
export function useResumoDosModulos(aberto: boolean): ResumoDados | null {
  const [dados, setDados] = useState<ResumoDados | null>(null);
  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    (async () => {
      const [campanhas, disparos, ofertas, funisAgendados, paginas] = await Promise.all([
        lista("/api/campanhas"),
        lista("/api/disparos"),
        lista("/api/relampago/offers"),
        // Envelope { agendados, enviados }: `lista` pega o 1º array, que é `agendados`.
        lista("/api/funis"),
        lista("/api/pages"),
      ]);
      if (cancelado) return;
      setDados({
        campanhas: campanhas.length,
        ultimoDisparo: disparos[0]?.createdAt ?? null,
        relampagoAoVivo: ofertas.some((o) => o.status === "open"),
        funisAgendados: funisAgendados.length,
        paginasNoAr: paginas.filter((p) => p.status === "published").length,
      });
    })();
    return () => {
      cancelado = true;
    };
  }, [aberto]);
  return dados;
}
