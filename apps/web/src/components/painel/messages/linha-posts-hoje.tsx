"use client";

import { useCallback, useEffect, useState } from "react";
import { lerFormatoPostsHoje, linhaDosPostsHoje, type PostsHoje, type TomDaLinha } from "@/lib/painel/posts-hoje";
import { cn } from "@/lib/utils";

/** Falha de rede, HTTP fora de 2xx ou corpo fora do formato: sem contagem (o banco decide no envio). */
async function lerPostsHoje(): Promise<PostsHoje | null> {
  try {
    const res = await fetch("/api/groups/posts-hoje");
    return res.ok ? lerFormatoPostsHoje(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Posts de hoje por grupo (`GET /api/groups/posts-hoje`): lê ao montar, a cada
 * `reler()` e toda vez que `ativo` volta a ser verdadeiro. Só a leitura mais nova
 * chega à tela: a resposta atrasada de uma anterior, ou de um compositor já
 * desmontado, é descartada. Leitura que falha vira `dados = null`, e sem dados
 * não há linha.
 *
 * `ativo` é para quem mantém o compositor montado mas escondido (a aba Posts da
 * campanha): inativo não consulta e larga a contagem velha, para que voltar a
 * abrir não mostre por um instante a de antes do último post.
 */
export function usePostsHoje(ativo = true): { dados: PostsHoje | null; reler: () => void } {
  const [dados, setDados] = useState<PostsHoje | null>(null);
  const [leituras, setLeituras] = useState(0);

  useEffect(() => {
    if (!ativo) {
      setDados(null);
      return;
    }
    let descartada = false;
    void lerPostsHoje().then((lida) => {
      if (!descartada) setDados(lida);
    });
    return () => {
      descartada = true;
    };
  }, [leituras, ativo]);

  const reler = useCallback(() => setLeituras((n) => n + 1), []);
  return { dados, reler };
}

// aviso e erro não podem parecer iguais: `text-alerta` é o mesmo token que `text-danger-700`.
const COR: Record<TomDaLinha, string> = {
  info: "text-slate-600",
  aviso: "text-warning-700",
  erro: "text-danger-700",
};

/**
 * A frase acima do botão de postar, contada sobre os mesmos grupos que o botão
 * conta. Nunca trava o envio: quem recusa é o banco. Sem frase, não renderiza nada.
 */
export function LinhaPostsHoje({ dados, grupos }: { dados: PostsHoje | null; grupos: readonly string[] }) {
  const linha = dados ? linhaDosPostsHoje(dados, grupos) : null;
  if (!linha) return null;
  return (
    <p role="status" className={cn("mt-3 text-13", COR[linha.tom])}>
      {linha.texto}
    </p>
  );
}
