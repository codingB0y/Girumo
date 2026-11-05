"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FichaDaPessoa } from "@/lib/ig/pessoas-tipos";
import { lerJson } from "../pessoas/use-pessoas";

export type CargaDaFicha = "carregando" | "ok" | "sem-ficha" | "sem-acesso" | "erro";

/**
 * A ficha da pessoa da conversa. A conversa não carrega o id da ficha (nem o do Instagram): a rota da conversa devolve
 * o `contatoId` (busca exata no servidor, pelo id do Instagram) e a ficha vem das rotas de Pessoas.
 */
export function useFicha(conversaId: string) {
  const [ficha, setFicha] = useState<FichaDaPessoa | null>(null);
  const [carga, setCarga] = useState<CargaDaFicha>("carregando");
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const eu = ++pedido.current;
    setFicha(null);
    setCarga("carregando");
    const achada = await lerJson<{ contatoId: string | null }>(`/api/ig/conversations/${conversaId}`);
    if (eu !== pedido.current) return;
    if (!achada.ok) return setCarga(achada.status === 403 ? "sem-acesso" : "erro");
    if (!achada.dados.contatoId) return setCarga("sem-ficha");
    const detalhe = await lerJson<FichaDaPessoa>(`/api/ig/contacts/${achada.dados.contatoId}`);
    if (eu !== pedido.current) return;
    if (!detalhe.ok) return setCarga(detalhe.status === 403 ? "sem-acesso" : "erro");
    setFicha(detalhe.dados);
    setCarga("ok");
  }, [conversaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Põe e tira etiquetas na ficha; devolve a mensagem de erro, ou null se salvou. */
  const editarEtiquetas = useCallback(
    async (add: string[], remove: string[]): Promise<string | null> => {
      const id = ficha?.pessoa.id;
      if (!id) return "Ficha não carregada.";
      const r = await fetch(`/api/ig/contacts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ add, remove }) }).catch(() => null);
      if (!r?.ok) return r?.status === 400 ? "Etiqueta inválida: use letras, números e hífen." : "Não deu pra salvar. Tente de novo.";
      const { pessoa } = (await r.json()) as { pessoa: FichaDaPessoa["pessoa"] };
      setFicha((f) => (f ? { ...f, pessoa } : f));
      return null;
    },
    [ficha?.pessoa.id],
  );

  return { ficha, carga, recarregar: carregar, editarEtiquetas };
}
