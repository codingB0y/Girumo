// apps/web/src/components/painel/link-da-bio/use-editor-bio.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import type { DocumentoBio } from "@/lib/bio/documento";
import {
  contextoDe,
  ehPaginaBio,
  ehRespostaDoPainelBio,
  erroDoDocumento,
  estadoDe,
  mesmoConteudo,
  resultadoDoSalvar,
  type ContextoDoEditor,
  type ErroDeCampo,
  type EstadoSalvavel,
} from "@/lib/bio/editor";
import type { CorpoDoPatchBio } from "@/lib/bio/painel-api";
import type { Carga } from "@/lib/painel/types";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { authenticatedFetch } from "@/lib/supabase/client";

/** Tudo o que a tela do editor lê e faz. As abas recebem um recorte disto (`PropsDaAba`, em abas.tsx). */
export type EditorBio = {
  /** Carga do GET. */
  carga: Carga;
  contexto: ContextoDoEditor | null;
  /** Última versão salva (null = loja sem página: estado vazio). */
  pagina: PaginaBio | null;
  /** O que está na tela, ainda sem salvar. */
  rascunho: EstadoSalvavel | null;
  sujo: boolean;
  salvando: boolean;
  criando: boolean;
  /** 409 de versão ou 404: a frase do aviso com "Recarregar". */
  conflito: string | null;
  /** Falha do salvar que não é de campo (rede, 403, 5xx). */
  aviso: string | null;
  /** Erro de campo do salvar, até a aba dona chamar `limparErro` ou o próximo salvar. */
  erro: ErroDeCampo | null;
  /** Sobe a cada pedido de rever a entrada; a prévia só anima quando ela muda. */
  rodada: number;
  carregar: () => void;
  criar: () => void;
  salvar: () => void;
  descartar: () => void;
  mudarDocumento: (mudar: (documento: DocumentoBio) => DocumentoBio) => void;
  mudarPagina: (mudanca: Partial<Pick<EstadoSalvavel, "slug" | "publicada">>) => void;
  reverAnimacao: () => void;
  limparErro: () => void;
};

const URL_DA_API = "/api/link-da-bio";
const SEM_CONEXAO = "Sem conexão. Confira a internet e tente de novo.";

/**
 * Leva o foco a `id` no próximo quadro. Depois do commit de propósito: a `Folha` guarda quem a
 * abriu e prende o foco no mesmo commit (focar antes faria o foco não voltar ao fechar), e a
 * linha que sobe ou desce troca de lugar no DOM e perde o foco que tinha.
 */
export function focarDepois(id: string): void {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

/** Destino do foco quando o botão focado some: "Adicionar link" (ou o título, se ele não estiver na tela). */
export const ID_ADICIONAR = "bio-adicionar-link";
export const ID_TITULO = "bio-titulo";

/** Depois de Descartar ou de um salvar 200 (o botão focado desmonta ou fica disabled): se o foco caiu no body, leva-o a um destino. */
export function focarSeFoiPerdido(): void {
  // rAF duplo: o setState do salvar vem depois de um `await`; o 1º frame pode rodar antes do commit do React.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected && !(a instanceof HTMLButtonElement && a.disabled)) return;
      (document.getElementById(ID_ADICIONAR) ?? document.getElementById(ID_TITULO))?.focus();
    }),
  );
}

/**
 * Estado do editor do link da bio (spec §8): a versão salva, o rascunho local, o contexto do GET
 * e a rodada da animação. Salvar é explícito, com trava otimista por `versao` (409 → Recarregar).
 * Fala com a API por `authenticatedFetch`: quem entrou pelo Google só tem Bearer.
 */
export function useEditorBio(): EditorBio {
  const toast = useToast();
  const [carga, setCarga] = useState<Carga>("carregando");
  const [contexto, setContexto] = useState<ContextoDoEditor | null>(null);
  const [pagina, setPagina] = useState<PaginaBio | null>(null);
  const [rascunho, setRascunho] = useState<EstadoSalvavel | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [conflito, setConflito] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<ErroDeCampo | null>(null);
  const [rodada, setRodada] = useState(0);
  // "Tentar de novo" e "Recarregar" rápidos disparam duas buscas: só a última escreve.
  const ultima = useRef(0);
  // Duplo clique em Salvar: `salvando` (estado) só muda no próximo render; a trava é síncrona.
  const emVoo = useRef(false);

  const carregar = useCallback(() => {
    const esta = ++ultima.current;
    setCarga("carregando");
    void (async () => {
      try {
        const r = await authenticatedFetch(URL_DA_API, { cache: "no-store" });
        const corpo: unknown = r.ok ? await r.json() : null;
        if (esta !== ultima.current) return;
        if (!ehRespostaDoPainelBio(corpo)) {
          setCarga("erro");
          return;
        }
        setContexto(contextoDe(corpo));
        setPagina(corpo.pagina);
        setRascunho(corpo.pagina ? estadoDe(corpo.pagina) : null);
        setConflito(null);
        setAviso(null);
        setErro(null);
        setCarga("ok");
      } catch {
        if (esta === ultima.current) setCarga("erro");
      }
    })();
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const sujo = useMemo(
    () => pagina !== null && rascunho !== null && !mesmoConteudo(rascunho, estadoDe(pagina)),
    [pagina, rascunho],
  );

  const criar = useCallback(async () => {
    setCriando(true);
    try {
      const r = await authenticatedFetch(URL_DA_API, { method: "POST" });
      const corpo: unknown = r.ok ? await r.json() : null;
      if (ehPaginaBio(corpo)) {
        setPagina(corpo);
        setRascunho(estadoDe(corpo));
      } else {
        toast("Não deu pra criar a página. Tente de novo.", "error");
      }
    } catch {
      toast(SEM_CONEXAO, "error");
    } finally {
      setCriando(false);
    }
  }, [toast]);

  const salvar = useCallback(async () => {
    if (carga !== "ok" || !pagina || !rascunho || emVoo.current) return;
    setConflito(null);
    setErro(null);
    setAviso(null);
    const local = erroDoDocumento(rascunho.documento);
    if (local) {
      setErro(local);
      return;
    }
    const enviado = rascunho;
    const corpoDoPatch: CorpoDoPatchBio = { versao: pagina.versao, ...enviado };
    // Recarregar durante o envio troca a base: a resposta atrasada não vale mais.
    const rodadaDoGet = ultima.current;
    emVoo.current = true;
    setSalvando(true);
    try {
      const r = await authenticatedFetch(URL_DA_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpoDoPatch),
      });
      // Corpo lido uma vez: JSON das nossas rotas, ou texto puro (403 de permissão e do guard).
      const texto = await r.text();
      let corpo: unknown = null;
      try {
        corpo = JSON.parse(texto);
      } catch {
        // texto puro: `resultadoDoSalvar` olha o texto.
      }
      if (rodadaDoGet !== ultima.current) return;
      const resultado = resultadoDoSalvar(r.status, corpo, texto);
      if (resultado.tipo === "ok") {
        const salva = resultado.pagina;
        setPagina(salva);
        // Mexeu durante o envio? Fica o que está na tela (continua sujo); senão vale o que o servidor gravou.
        setRascunho((atual) => (atual && !mesmoConteudo(atual, enviado) ? atual : estadoDe(salva)));
        // O servidor recusa número conectado no salvar (§4): no que acabou de salvar não sobra link escondido por número.
        setContexto((c) => (c ? { ...c, linksEscondidos: [] } : c));
        focarSeFoiPerdido();
        toast(salva.publicada && !salva.bloqueadaEm ? "Salvo. A página no ar já mudou." : "Salvo. A página continua fora do ar.");
      } else if (resultado.tipo === "conflito") {
        setConflito(resultado.mensagem);
      } else if (resultado.tipo === "campo") {
        setErro(resultado.erro);
      } else {
        setAviso(resultado.mensagem);
      }
    } catch {
      if (rodadaDoGet === ultima.current) setAviso(SEM_CONEXAO);
    } finally {
      emVoo.current = false;
      setSalvando(false);
    }
  }, [carga, pagina, rascunho, toast]);

  const descartar = useCallback(() => {
    if (!pagina) return;
    setRascunho(estadoDe(pagina));
    setErro(null);
    setAviso(null);
    toast("Alterações descartadas.");
    focarSeFoiPerdido();
  }, [pagina, toast]);

  const mudarDocumento = useCallback((mudar: (documento: DocumentoBio) => DocumentoBio) => {
    setRascunho((r) => (r ? { ...r, documento: mudar(r.documento) } : r));
  }, []);

  const mudarPagina = useCallback((mudanca: Partial<Pick<EstadoSalvavel, "slug" | "publicada">>) => {
    setRascunho((r) => (r ? { ...r, ...mudanca } : r));
  }, []);

  const reverAnimacao = useCallback(() => setRodada((n) => n + 1), []);
  const limparErro = useCallback(() => setErro(null), []);

  return {
    carga,
    contexto,
    pagina,
    rascunho,
    sujo,
    salvando,
    criando,
    conflito,
    aviso,
    erro,
    rodada,
    carregar,
    criar,
    salvar,
    descartar,
    mudarDocumento,
    mudarPagina,
    reverAnimacao,
    limparErro,
  };
}
