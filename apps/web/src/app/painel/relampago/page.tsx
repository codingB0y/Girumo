"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { Group } from "@/lib/mock-data";
import { RelampagoVitrine, type NovaOferta } from "@/components/painel/relampago/vitrine/relampago-vitrine";

type Offer = {
  id: string;
  name: string;
  keyword: string;
  slots: number;
  timer_seconds: number | null;
  status: "draft" | "open" | "closed";
  opened_at: string | null;
  created_at: string;
};

export default function PainelRelampago() {
  const router = useRouter();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [resOfertas, resGrupos] = await Promise.all([
      fetch("/api/relampago/offers", { cache: "no-store" }),
      fetch("/api/groups", { cache: "no-store" }),
    ]);
    const dadosOfertas = await resOfertas.json();
    const dadosGrupos = await resGrupos.json();
    setOffers(Array.isArray(dadosOfertas?.offers) ? dadosOfertas.offers : []);
    setGroups(Array.isArray(dadosGrupos) ? dadosGrupos : []);
  }, []);

  useEffect(() => {
    carregar()
      .catch(() => setErro("Nao foi possivel carregar as ofertas."))
      .finally(() => setLoading(false));
  }, [carregar]);

  /**
   * Só grupo que administramos. Num grupo sem admin a instância não vê os
   * participantes, então o mapa @lid -> telefone nasce vazio e a fila viria
   * inteira sem número — sem chance de chamar ninguém.
   */
  const elegiveis = useMemo(() => groups.filter((g) => g.isAdmin), [groups]);

  async function abrir(corpo: NovaOferta) {
    setAbrindo(true);
    setErro(null);
    try {
      const res = await fetch("/api/relampago/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });

      const dados = await res.json().catch(() => null);

      if (!res.ok) {
        // 409 é a recusa do índice único chegando na tela. Precisa dizer o que
        // fazer, não só que deu errado.
        setErro(dados?.error ?? "Nao foi possivel abrir a oferta.");
        return;
      }

      router.push(`/painel/relampago/${dados.offer.id}`);
    } catch {
      setErro("Nao foi possivel abrir a oferta.");
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <RelampagoVitrine
      ofertas={offers}
      elegiveis={elegiveis}
      carregando={loading}
      abrindo={abrindo}
      erro={erro}
      aoAbrir={abrir}
    />
  );
}
