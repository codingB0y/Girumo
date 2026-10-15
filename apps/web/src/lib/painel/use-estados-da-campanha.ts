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

const CARREGANDO: CargaDosEstados = { fase: "carregando" };

/** A carga que o hook guarda, com a campanha a que ela pertence. */
export type CargaGuardada = { slug: string; carga: CargaDosEstados } | null;

/**
 * O que a tela vê para `slug`: só a carga guardada para ESTE slug. Slug novo (ou vazio) é
 * `carregando` até a primeira leitura dele chegar, nunca a lista de outra campanha.
 */
export function cargaDoSlug(guardada: CargaGuardada, slug: string): CargaDosEstados {
  return slug !== "" && guardada?.slug === slug ? guardada.carga : CARREGANDO;
}

/** `cargaAposLeitura` para o slug lido: a base é a carga DESTE slug, então a lista de outro não vira "velha". */
export function aplicarLeitura(guardada: CargaGuardada, slug: string, lida: EstadosDaCampanha | null): CargaGuardada {
  return { slug, carga: cargaAposLeitura(cargaDoSlug(guardada, slug), lida) };
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
 *
 * Slug vazio não lê nada (a folha da barra passa "" enquanto fechada) e larga a lista guardada;
 * voltar ao mesmo slug lê de novo. A tela nunca recebe a lista de outro slug: trocar de campanha
 * é `carregando` até a leitura da nova chegar.
 */
export function useEstadosDaCampanha(slug: string, chave: unknown) {
  const [guardada, setGuardada] = useState<CargaGuardada>(null);
  const ultima = useRef<Promise<void> | null>(null);

  const recarregar = useCallback(async () => {
    if (slug === "") {
      ultima.current = null; // a leitura em voo da campanha anterior não chega mais à tela
      setGuardada(null);
      return;
    }
    const minha: Promise<void> = lerEstados(slug).then((lida) => {
      if (ultima.current === minha) setGuardada((atual) => aplicarLeitura(atual, slug, lida));
    });
    ultima.current = minha;
    let esperando = minha;
    await esperando;
    while (ultima.current && ultima.current !== esperando) {
      esperando = ultima.current;
      await esperando;
    }
  }, [slug]);

  useEffect(() => {
    void recarregar();
  }, [recarregar, chave]);

  const tentarDeNovo = useCallback(() => {
    setGuardada(null);
    void recarregar();
  }, [recarregar]);

  return { carga: cargaDoSlug(guardada, slug), recarregar, tentarDeNovo };
}
