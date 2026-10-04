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

function patch(id: string, corpo: Corpo, keepalive = false): Promise<Response> {
  return fetch(`/api/ig/flows/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), keepalive });
}

/**
 * Carrega o fluxo, guarda o rascunho sozinho (800 ms depois da última edição) e
 * publica. Toda edição passa por `editar(fn)`, que recebe o grafo e devolve
 * outro: é como as operações de `lib/ig/flow/edit.ts` entram na tela.
 *
 * Só há um PATCH no ar por vez (`voo`): edição durante o envio fica em
 * `pendente` e sai no laço seguinte, em ordem. Falha de rede ou 5xx tenta de
 * novo (espera dobrando, até MAX_TENTATIVAS); 4xx para em `falhou` até a
 * próxima edição. Ao sair da tela, o que sobrou vai com `keepalive`.
 */
export function useFluxo(id: string) {
  const [flow, setFlow] = useState<FlowRow | null>(null);
  const [carga, setCarga] = useState<Carga>("carregando");
  const [naoAchou, setNaoAchou] = useState(false);
  const [salvamento, setSalvamento] = useState<Salvamento>("salvo");
  const pendente = useRef<Corpo | null>(null);
  const tentativas = useRef(0);
  const voo = useRef<Promise<boolean> | null>(null);
  const leitura = useRef(0);

  const recarregar = useCallback(async () => {
    const minha = ++leitura.current;
    setCarga("carregando");
    setNaoAchou(false);
    try {
      const r = await fetch(`/api/ig/flows/${id}`, { cache: "no-store" });
      if (minha !== leitura.current) return;
      if (r.status === 404) {
        setNaoAchou(true);
        setCarga("ok");
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const { flow: lido } = (await r.json()) as { flow: FlowRow };
      if (minha !== leitura.current) return;
      setFlow(lido);
      setCarga("ok");
    } catch {
      if (minha === leitura.current) setCarga("erro");
    }
  }, [id]);

  useEffect(() => {
    void recarregar();
    return () => {
      leitura.current++; // resposta atrasada de outro id não entra
    };
  }, [recarregar]);

  /**
   * Manda o que estiver pendente, um PATCH por vez, até esvaziar. Quem chamar
   * com um envio no ar pega o mesmo envio. `true` = nada ficou por salvar.
   */
  const drenar = useCallback((): Promise<boolean> => {
    if (voo.current) return voo.current;
    const p = (async () => {
      let status = 200;
      while (pendente.current) {
        const corpo = pendente.current;
        setSalvamento("salvando");
        try {
          status = (await patch(id, corpo)).status;
        } catch {
          status = 0; // rede caída
        }
        if (status >= 200 && status < 300) {
          if (pendente.current === corpo) pendente.current = null;
          tentativas.current = 0;
        } else if (pendente.current === corpo) {
          break;
        } // senão: houve edição no meio, o corpo novo já leva os campos de antes
      }
      if (!pendente.current) {
        setSalvamento("salvo");
        return true;
      }
      if (valeTentarDeNovo(status) && tentativas.current < MAX_TENTATIVAS) {
        tentativas.current += 1;
        setSalvamento("erro");
      } else {
        setSalvamento("falhou");
      }
      return false;
    })().finally(() => {
      voo.current = null;
    });
    voo.current = p;
    return p;
  }, [id]);

  // Um temporizador por rajada de edições (ou por tentativa, com espera dobrada).
  useEffect(() => {
    if (salvamento !== "pendente" && salvamento !== "erro") return;
    const t = setTimeout(() => void drenar(), atrasoDoSalvamento(salvamento === "erro" ? tentativas.current : 0));
    return () => clearTimeout(t);
  }, [salvamento, drenar]);

  // Saiu da tela (ou trocou de fluxo) com edição por salvar: manda e esquece.
  useEffect(
    () => () => {
      if (pendente.current) void patch(id, pendente.current, true).catch(() => {});
      pendente.current = null;
      tentativas.current = 0;
    },
    [id],
  );

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
    // O servidor publica o que está guardado: guarda a tela antes.
    if (!(await drenar())) return { tipo: "erro", mensagem: "Não deu pra salvar antes de publicar." };
    try {
      const r = await fetch(`/api/ig/flows/${id}/publish`, { method: "POST" });
      const texto = await r.text();
      const resultado = resultadoDaPublicacao(r.status, texto);
      if (resultado.tipo === "ok") {
        let publicado: FlowRow | null = null;
        try {
          publicado = (JSON.parse(texto) as { flow?: FlowRow }).flow ?? null;
        } catch {
          // corpo ilegível: publicou mesmo assim, relê abaixo
        }
        if (publicado) {
          const novo = publicado;
          // O servidor não escreve o rascunho: mantém o que está na tela.
          setFlow((atual) => (atual ? { ...novo, name: atual.name, draft: atual.draft } : novo));
        } else {
          void recarregar();
        }
      }
      return resultado;
    } catch {
      return { tipo: "erro", mensagem: "Sem conexão. Tente de novo." };
    }
  }, [id, drenar, recarregar]);

  return { flow, carga, naoAchou, salvamento, editar, renomear, publicar, recarregar };
}
