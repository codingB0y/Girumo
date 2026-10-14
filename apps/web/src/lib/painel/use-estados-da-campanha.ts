"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EstadosDaCampanha } from "@/lib/groups/resumo-estados";

/**
 * A leitura de `GET /api/campanhas/[slug]/grupos/estados` das três abas da campanha (Visão geral,
 * Grupos, Link e cliques): uma fonte só do estado, lida do mesmo jeito.
 *
 * A releitura que falha guarda a última lista e a marca velha (`desatualizada`). Cada aba decide o
 * que fazer com isso: a Grupos mostra a lista com um aviso; quem não pode mostrar estado velho
 * (o destino do link, a contagem da Visão geral) usa `estadosFrescos`.
 */

export type CargaDosEstados =
  | { fase: "carregando" }
  | { fase: "erro" }
  | { fase: "pronto"; dados: EstadosDaCampanha; desatualizada: boolean };

/** `lida` nula = a leitura falhou (rede, HTTP fora de 2xx ou JSON quebrado). */
export function cargaAposLeitura(atual: CargaDosEstados, lida: EstadosDaCampanha | null): CargaDosEstados {
  if (lida) return { fase: "pronto", dados: lida, desatualizada: false };
  return atual.fase === "pronto" ? { ...atual, desatualizada: true } : { fase: "erro" };
}

/** null = lendo; "erro" = falhou, inclusive a lista velha. A aba não chuta. */
export function estadosFrescos(carga: CargaDosEstados): EstadosDaCampanha | "erro" | null {
  if (carga.fase === "carregando") return null;
  if (carga.fase === "erro" || carga.desatualizada) return "erro";
  return carga.dados;
}

async function lerEstados(slug: string): Promise<EstadosDaCampanha | null> {
  try {
    const res = await fetch(`/api/campanhas/${encodeURIComponent(slug)}/grupos/estados`);
    return res.ok ? ((await res.json()) as EstadosDaCampanha) : null;
  } catch {
    return null;
  }
}

/**
 * Lê ao montar e de novo quando `chave` muda (o `atualizadoEm` da página). Só a leitura mais nova
 * chega à tela: a resposta atrasada de uma anterior é descartada. `recarregar` resolve quando a
 * tela tem a leitura mais nova, mesmo que outra tenha começado no meio (o "atualizado" da página
 * durante uma ação): o botão da aba Grupos só solta com a linha nova.
 */
export function useEstadosDaCampanha(slug: string, chave: unknown) {
  const [carga, setCarga] = useState<CargaDosEstados>({ fase: "carregando" });
  const ultima = useRef<Promise<void> | null>(null);

  const recarregar = useCallback(async () => {
    const minha: Promise<void> = lerEstados(slug).then((lida) => {
      if (ultima.current === minha) setCarga((atual) => cargaAposLeitura(atual, lida));
    });
    ultima.current = minha;
    let esperando = minha;
    await esperando;
    while (ultima.current !== esperando) {
      esperando = ultima.current ?? esperando;
      await esperando;
    }
  }, [slug]);

  useEffect(() => {
    void recarregar();
  }, [recarregar, chave]);

  const tentarDeNovo = useCallback(() => {
    setCarga({ fase: "carregando" });
    void recarregar();
  }, [recarregar]);

  return { carga, recarregar, tentarDeNovo };
}
