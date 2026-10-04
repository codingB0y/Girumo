"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_TENTATIVAS,
  atrasoDoSalvamento,
  resultadoDaPublicacao,
  valeTentarDeNovo,
  type ResultadoPublicacao,
  type Salvamento,
} from "@/lib/ig/flow/salvamento";
import type { FlowDef } from "@/lib/ig/flow/types";
import type { Carga } from "@/lib/painel/types";
import type { FlowRow } from "@/lib/stores/ig-flows";

type Corpo = { name?: string; draft?: FlowDef };

/**
 * Carrega o fluxo, guarda o rascunho sozinho (800 ms depois da última edição) e
 * publica. Toda edição passa por `editar(fn)`, que recebe o grafo e devolve
 * outro: é como as operações de `lib/ig/flow/edit.ts` entram na tela.
 *
 * Falha de rede ou 5xx tenta de novo (espera dobrando, até MAX_TENTATIVAS);
 * 4xx para em `falhou` até a próxima edição.
 */
export function useFluxo(id: string) {
  const [flow, setFlow] = useState<FlowRow | null>(null);
  const [carga, setCarga] = useState<Carga>("carregando");
  const [naoAchou, setNaoAchou] = useState(false);
  const [salvamento, setSalvamento] = useState<Salvamento>("salvo");
  const pendente = useRef<Corpo | null>(null);
  const tentativas = useRef(0);

  const recarregar = useCallback(async () => {
    setCarga("carregando");
    try {
      const r = await fetch(`/api/ig/flows/${id}`, { cache: "no-store" });
      if (r.status === 404) {
        setNaoAchou(true);
        setCarga("ok");
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const { flow: lido } = (await r.json()) as { flow: FlowRow };
      setFlow(lido);
      setCarga("ok");
    } catch {
      setCarga("erro");
    }
  }, [id]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // Um temporizador por rajada de edições; o PATCH leva só o que mudou.
  useEffect(() => {
    if (salvamento !== "pendente" && salvamento !== "erro") return;
    const t = setTimeout(async () => {
      const corpo = pendente.current;
      if (!corpo) return;
      setSalvamento("salvando");
      let status = 0; // 0 = rede caída
      try {
        const r = await fetch(`/api/ig/flows/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        status = r.status;
      } catch {
        // fica 0
      }
      if (pendente.current !== corpo) {
        // Houve edição durante o envio: ela já carrega os campos de antes.
        tentativas.current = 0;
        setSalvamento("pendente");
      } else if (status >= 200 && status < 300) {
        pendente.current = null;
        tentativas.current = 0;
        setSalvamento("salvo");
      } else if (valeTentarDeNovo(status) && tentativas.current < MAX_TENTATIVAS) {
        tentativas.current += 1;
        setSalvamento("erro");
      } else {
        setSalvamento("falhou");
      }
    }, atrasoDoSalvamento(salvamento === "erro" ? tentativas.current : 0));
    return () => clearTimeout(t);
  }, [salvamento, id]);

  const marcarPendente = useCallback((corpo: Corpo) => {
    pendente.current = { ...(pendente.current ?? {}), ...corpo };
    tentativas.current = 0;
    setSalvamento("pendente");
  }, []);

  const editar = useCallback(
    (fn: (def: FlowDef) => FlowDef) => {
      setFlow((atual) => {
        if (!atual) return atual;
        const draft = fn(atual.draft);
        marcarPendente({ draft });
        return { ...atual, draft };
      });
    },
    [marcarPendente],
  );

  const renomear = useCallback(
    (name: string) => {
      setFlow((atual) => (atual ? { ...atual, name } : atual));
      marcarPendente({ name });
    },
    [marcarPendente],
  );

  /** `ok` = publicou; `issues` = o que falta; `erro` = mensagem pra mostrar. */
  const publicar = useCallback(async (): Promise<ResultadoPublicacao> => {
    try {
      const r = await fetch(`/api/ig/flows/${id}/publish`, { method: "POST" });
      const texto = await r.text();
      const resultado = resultadoDaPublicacao(r.status, texto);
      if (resultado.tipo === "ok") {
        const { flow: publicado } = JSON.parse(texto) as { flow: FlowRow };
        // O servidor não escreve o rascunho: mantém o que está na tela.
        setFlow((atual) => (atual ? { ...publicado, name: atual.name, draft: atual.draft } : publicado));
      }
      return resultado;
    } catch {
      return { tipo: "erro", mensagem: "Sem conexão. Tente de novo." };
    }
  }, [id]);

  return { flow, carga, naoAchou, salvamento, editar, renomear, publicar, recarregar };
}
