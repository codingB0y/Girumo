"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FichaDaPessoa, ListaDePessoas } from "@/lib/ig/pessoas-tipos";
import { lerJson } from "../pessoas/use-pessoas";

export type CargaDaFicha = "carregando" | "ok" | "sem-ficha" | "sem-acesso" | "erro";

/**
 * A ficha da pessoa da conversa. A conversa não carrega o id da ficha (nem o do Instagram): acha pelo @, nas rotas de
 * Pessoas, e só aceita o @ idêntico (a busca é por trecho).
 */
export function useFicha(username: string | null) {
  const [ficha, setFicha] = useState<FichaDaPessoa | null>(null);
  const [carga, setCarga] = useState<CargaDaFicha>("carregando");
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const eu = ++pedido.current;
    setFicha(null);
    if (!username) return setCarga("sem-ficha");
    setCarga("carregando");
    const lista = await lerJson<ListaDePessoas>(`/api/ig/contacts?q=${encodeURIComponent(username)}`);
    if (eu !== pedido.current) return;
    if (!lista.ok) return setCarga(lista.status === 403 ? "sem-acesso" : "erro");
    const achada = lista.dados.pessoas.find((p) => p.username?.toLowerCase() === username.toLowerCase());
    if (!achada) return setCarga("sem-ficha");
    const detalhe = await lerJson<FichaDaPessoa>(`/api/ig/contacts/${achada.id}`);
    if (eu !== pedido.current) return;
    if (!detalhe.ok) return setCarga(detalhe.status === 403 ? "sem-acesso" : "erro");
    setFicha(detalhe.dados);
    setCarga("ok");
  }, [username]);

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
