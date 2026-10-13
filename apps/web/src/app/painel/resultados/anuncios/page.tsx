"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AbaAnuncios } from "@/components/painel/resultados/anuncios/aba-anuncios";
import { dayBR } from "@/lib/date-br";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";
import { ehRespostaAnuncios } from "@/lib/resultados/anuncios-tela";
import { periodoDoAtalho, type AtalhoDoPeriodo } from "@/lib/resultados/periodo-anuncios";
import type { RespostaAnuncios } from "@/lib/resultados/relatorio-anuncios";

/**
 * Resultados › Anúncios (spec 2026-10-10-funil-anuncios §4). Uma consulta só,
 * `GET /api/resultados/anuncios`, refeita a cada troca de período.
 */
export default function PainelResultadosAnuncios() {
  const [atalho, setAtalho] = useState<AtalhoDoPeriodo>("30d");
  const [resposta, setResposta] = useState<RespostaAnuncios | null>(null);
  const [carga, setCarga] = useState<Carga>("carregando");
  // Trocar de período rápido dispara duas buscas; só a última pode escrever na tela,
  // senão a de 7 dias que chegou atrasada pinta o funil com o botão "90 dias" marcado.
  const ultima = useRef(0);

  const carregar = useCallback(() => {
    const esta = ++ultima.current;
    const { de, ate } = periodoDoAtalho(atalho, new Date());
    void buscar(
      `/api/resultados/anuncios?de=${de}&ate=${ate}`,
      ehRespostaAnuncios,
      (r) => {
        if (esta === ultima.current) setResposta(r);
      },
      (c) => {
        if (esta === ultima.current) setCarga(c);
      },
    );
  }, [atalho]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <AbaAnuncios
      atalho={atalho}
      onAtalho={setAtalho}
      carga={carga}
      resposta={resposta}
      hoje={dayBR()}
      aoTentarDeNovo={carregar}
    />
  );
}
