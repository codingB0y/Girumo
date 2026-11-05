"use client";

import { useCallback, useRef, useState } from "react";
import type { RespostaPronta } from "@/lib/ig/conversas/campo";
import type { Resultado } from "./use-fio";

export type CargaDasRespostas = "ocioso" | "carregando" | "ok" | "erro";

type Corpo = { error?: string; respostas?: RespostaPronta[]; resposta?: RespostaPronta };

/**
 * As respostas prontas da loja (`/api/ig/canned-replies`). Só busca quando alguém abre a lista (`carregar`): quem não
 * usa não paga a consulta a cada conversa aberta. Não há edição: para trocar o texto, apaga e cria.
 */
export function useRespostasProntas() {
  const [respostas, setRespostas] = useState<RespostaPronta[]>([]);
  const [carga, setCarga] = useState<CargaDasRespostas>("ocioso");
  const pedido = useRef<Promise<void> | null>(null);

  const carregar = useCallback((): Promise<void> => {
    if (pedido.current) return pedido.current;
    setCarga("carregando");
    pedido.current = fetch("/api/ig/canned-replies", { cache: "no-store" })
      .then(async (r) => {
        const corpo = (await r.json().catch(() => null)) as Corpo | null;
        if (!r.ok || !Array.isArray(corpo?.respostas)) throw new Error("falhou");
        setRespostas(corpo.respostas);
        setCarga("ok");
      })
      .catch(() => {
        pedido.current = null; // a próxima abertura tenta de novo
        setCarga("erro");
      });
    return pedido.current;
  }, []);

  const criar = useCallback(async (titulo: string, texto: string): Promise<Resultado> => {
    try {
      const r = await fetch("/api/ig/canned-replies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ titulo, texto }) });
      const corpo = (await r.json().catch(() => null)) as Corpo | null;
      // No 409 o `error` da rota já diz que o teto de 50 foi atingido.
      if (!r.ok || !corpo?.resposta) return { ok: false, mensagem: corpo?.error ?? "Não deu pra salvar. Tente de novo." };
      const nova = corpo.resposta;
      setRespostas((atuais) => [...atuais, nova]);
      return { ok: true };
    } catch {
      return { ok: false, mensagem: "Sem conexão. Tente de novo." };
    }
  }, []);

  const apagar = useCallback(async (id: string): Promise<Resultado> => {
    try {
      const r = await fetch(`/api/ig/canned-replies/${encodeURIComponent(id)}`, { method: "DELETE" });
      // 404: já tinha sumido (outra aba apagou); a lista também deve perdê-la.
      if (!r.ok && r.status !== 404) return { ok: false, mensagem: ((await r.json().catch(() => null)) as Corpo | null)?.error ?? "Não deu pra apagar. Tente de novo." };
      setRespostas((atuais) => atuais.filter((x) => x.id !== id));
      return { ok: true };
    } catch {
      return { ok: false, mensagem: "Sem conexão. Tente de novo." };
    }
  }, []);

  return { respostas, carga, carregar, criar, apagar };
}
