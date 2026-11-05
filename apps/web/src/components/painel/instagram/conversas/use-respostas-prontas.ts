"use client";

import { useCallback, useRef, useState } from "react";
import type { RespostaPronta } from "@/lib/ig/conversas/campo";
import { guardarNoCache, lerDoCache, limparDoCache } from "./cache-da-loja";
import type { Resultado } from "./use-fio";

export type CargaDasRespostas = "ocioso" | "carregando" | "ok" | "erro";

type Corpo = { error?: string; respostas?: RespostaPronta[]; resposta?: RespostaPronta };

const ESPACO = "respostas-prontas";

/**
 * As respostas prontas da loja (`/api/ig/canned-replies`). Só busca quando alguém abre a lista (`carregar`) e guarda a
 * lista por loja na sessão da página; criar e apagar invalidam. Não há edição: para trocar o texto, apaga e cria.
 */
export function useRespostasProntas(tenantId: string | null) {
  const [respostas, setRespostas] = useState<RespostaPronta[]>([]);
  const [carga, setCarga] = useState<CargaDasRespostas>("ocioso");
  const pedido = useRef<Promise<void> | null>(null);

  const carregar = useCallback((): Promise<void> => {
    const guardada = lerDoCache<RespostaPronta[]>(ESPACO, tenantId);
    if (guardada) {
      setRespostas(guardada);
      setCarga("ok");
      return Promise.resolve();
    }
    if (pedido.current) return pedido.current;
    setCarga("carregando");
    pedido.current = fetch("/api/ig/canned-replies", { cache: "no-store" })
      .then(async (r) => {
        const corpo = (await r.json().catch(() => null)) as Corpo | null;
        if (!r.ok || !Array.isArray(corpo?.respostas)) throw new Error("falhou");
        guardarNoCache(ESPACO, tenantId, corpo.respostas);
        setRespostas(corpo.respostas);
        setCarga("ok");
        pedido.current = null;
      })
      .catch(() => {
        pedido.current = null; // a próxima abertura tenta de novo
        setCarga("erro");
      });
    return pedido.current;
  }, [tenantId]);

  const criar = useCallback(
    async (titulo: string, texto: string): Promise<Resultado> => {
      try {
        const r = await fetch("/api/ig/canned-replies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ titulo, texto }) });
        const corpo = (await r.json().catch(() => null)) as Corpo | null;
        // No 409 o `error` da rota já diz que o teto de 50 foi atingido.
        if (!r.ok || !corpo?.resposta) return { ok: false, mensagem: corpo?.error ?? "Não deu pra salvar. Tente de novo." };
        const nova = corpo.resposta;
        limparDoCache(ESPACO, tenantId);
        setRespostas((atuais) => [...atuais, nova]);
        return { ok: true };
      } catch {
        return { ok: false, mensagem: "Sem conexão. Tente de novo." };
      }
    },
    [tenantId],
  );

  const apagar = useCallback(
    async (id: string): Promise<Resultado> => {
      try {
        const r = await fetch(`/api/ig/canned-replies/${encodeURIComponent(id)}`, { method: "DELETE" });
        // 404: já tinha sumido (outra aba apagou); a lista também deve perdê-la.
        if (!r.ok && r.status !== 404) return { ok: false, mensagem: ((await r.json().catch(() => null)) as Corpo | null)?.error ?? "Não deu pra apagar. Tente de novo." };
        limparDoCache(ESPACO, tenantId);
        setRespostas((atuais) => atuais.filter((x) => x.id !== id));
        return { ok: true };
      } catch {
        return { ok: false, mensagem: "Sem conexão. Tente de novo." };
      }
    },
    [tenantId],
  );

  return { respostas, carga, carregar, criar, apagar };
}
