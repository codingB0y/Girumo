"use client";

import { useEffect, useState } from "react";
import { getActiveCampanhaId } from "@/lib/active-campanha";

export type Campanha = { id: string; name: string; loja: string; groupIds: string[]; createdAt: string };

/** Hook: lista de campanhas + a campanha ATIVA (cookie). */
export function useCampanhas() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function reload() {
    try {
      const list = await fetch("/api/campanhas").then((r) => r.json());
      setCampanhas(Array.isArray(list) ? list : []);
    } catch {
      // mantém
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    setActiveId(getActiveCampanhaId());
    reload();
  }, []);

  const active = campanhas.find((c) => c.id === activeId) ?? null;
  return { campanhas, active, activeId, loaded, reload };
}
