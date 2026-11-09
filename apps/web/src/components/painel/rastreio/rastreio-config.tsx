"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { CartaoNumeroDoAtendimento } from "@/components/privado/cartao-numero-do-atendimento";
import { ErroDeCarga } from "@/components/painel/erro-de-carga";
import { useRole } from "@/components/painel/role-provider";
import { useToast } from "@/components/toast";
import { alternarCanal, type CorpoDoPatchDaConfig, type RespostaDaConfig } from "@/lib/rastreio/config-painel";
import type { Canal, EtapaComAviso } from "@/lib/rastreio/tipos";
import { authenticatedFetch } from "@/lib/supabase/client";

import { PainelDoRastreio, type ErroDoRastreio } from "./rastreio-config-painel";

type Carga = "carregando" | "ok" | "erro" | "desligado";
type Chave = keyof CorpoDoPatchDaConfig;

const FALHA_AO_SALVAR = "Não deu para salvar. Tente de novo.";

async function lerErro(res: Response): Promise<ErroDoRastreio> {
  const corpo = (await res.json().catch(() => ({}))) as { error?: unknown; campo?: unknown };
  return {
    error: typeof corpo.error === "string" && corpo.error ? corpo.error : FALHA_AO_SALVAR,
    campo: typeof corpo.campo === "string" ? corpo.campo : "corpo",
  };
}

/** Configurações › Rastreio de pedidos: estado e chamadas. O desenho é `PainelDoRastreio`. */
export function RastreioConfiguracoes() {
  const { can, carregado } = useRole();
  const toast = useToast();
  const pode = carregado && can("settings:connection");
  const [carga, setCarga] = useState<Carga>("carregando");
  const [dados, setDados] = useState<RespostaDaConfig | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<ErroDoRastreio>(null);
  const vivo = useRef(true);

  const carregar = useCallback(async () => {
    setCarga("carregando");
    try {
      const res = await authenticatedFetch("/api/rastreio/config");
      if (!vivo.current) return;
      if (res.status === 403) {
        const corpo = (await res.json().catch(() => ({}))) as { code?: string };
        if (vivo.current) setCarga(corpo.code === "rastreio_disabled" ? "desligado" : "erro");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const lido = (await res.json()) as RespostaDaConfig;
      if (!vivo.current) return;
      setDados(lido);
      setCarga("ok");
    } catch {
      if (vivo.current) setCarga("erro");
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    if (pode) void carregar();
    return () => {
      vivo.current = false;
    };
  }, [pode, carregar]);

  /** Otimista: desenha já, manda o PATCH e volta ao anterior se a rota recusar. */
  async function salvar(chave: Chave, patch: CorpoDoPatchDaConfig) {
    if (!dados || salvando) return;
    const anterior = dados;
    // O número não é otimista: a rota normaliza (ou recusa) e só a resposta tem o formato gravado.
    if (chave !== "storeWhatsapp") {
      setDados({ ...anterior, config: { ...anterior.config, ...patch } as RespostaDaConfig["config"] });
    }
    setSalvando(chave);
    setErro(null);
    try {
      const res = await authenticatedFetch("/api/rastreio/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!vivo.current) return;
      if (!res.ok) {
        const e = await lerErro(res);
        if (!vivo.current) return;
        setDados(anterior);
        setErro(e);
        return;
      }
      const novo = (await res.json()) as RespostaDaConfig;
      if (vivo.current) setDados(novo);
    } catch {
      if (!vivo.current) return;
      setDados(anterior);
      setErro({ error: FALHA_AO_SALVAR, campo: chave });
    } finally {
      if (vivo.current) setSalvando(null);
    }
  }

  async function copiar() {
    if (!dados?.linkDaBusca) return;
    try {
      await navigator.clipboard.writeText(dados.linkDaBusca);
      toast("Link copiado");
    } catch {
      toast("Não deu para copiar. Selecione o link e copie.", "error");
    }
  }

  if (!pode) return null;
  if (carga === "carregando") {
    return (
      <div
        className="pn-skeleton h-64 rounded-[var(--radius-control)]"
        role="status"
        aria-label="Carregando o Rastreio de pedidos"
      />
    );
  }
  if (carga === "desligado") {
    return (
      <p className="pn-card rounded-[var(--radius-control)] p-6 text-[14px] text-volt-950">
        O Rastreio de pedidos ainda não foi liberado para a sua loja.
      </p>
    );
  }
  if (carga === "erro" || !dados) {
    return <ErroDeCarga titulo="Não deu para carregar o Rastreio de pedidos." aoTentarDeNovo={() => void carregar()} />;
  }

  return (
    <PainelDoRastreio
      dados={dados}
      cartaoDoNumero={<CartaoNumeroDoAtendimento />}
      salvando={salvando}
      erro={erro}
      aoAlternar={(etapa: EtapaComAviso, canal: Canal) =>
        void salvar("matrix", { matrix: alternarCanal(dados.config.matrix, etapa, canal) })
      }
      aoAlternarProblema={() => void salvar("notifyStoreOnProblem", { notifyStoreOnProblem: !dados.config.notifyStoreOnProblem })}
      // O número vai cru: a rota normaliza e devolve o formato gravado.
      aoSalvarNumero={(v) => void salvar("storeWhatsapp", { storeWhatsapp: v.trim() === "" ? null : v })}
      aoEscolherConvite={(id) => void salvar("vipLinkId", { vipLinkId: id })}
      aoCopiar={() => void copiar()}
    />
  );
}
