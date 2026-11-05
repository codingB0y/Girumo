"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MarcaDoFio } from "@/lib/ig/conversas/fio";
import { criarSequencia, mesclarMensagens } from "@/lib/ig/conversas/tela";
import type { ConversaDto, FioDaConversa, MensagemDto } from "@/lib/ig/conversas/tipos";

export type CargaDoFio = "carregando" | "ok" | "erro" | "nao-achou";
export type Resultado = { ok: true } | { ok: false; mensagem: string };
export type AcaoDaConversa = "resolver" | "pausar" | "retomar";
/** O que o campo manda: texto, uma mídia já enviada ao Storage (`midiaId`) ou os dois. */
export type Envio = { texto?: string; midiaId?: string };

type Janela = FioDaConversa["janela"];
type Corpo = { error?: string; code?: string };

const SEM_JANELA: Janela = { estado: "fechada", ultimaDelaEm: null };
const FALHA_DE_REDE: Resultado = { ok: false, mensagem: "Sem conexão. Tente de novo." };

async function lerCorpo(r: Response): Promise<Corpo | null> {
  return (await r.json().catch(() => null)) as Corpo | null;
}

type Opcoes = {
  /** A conversa mudou por uma ação desta tela (resolver, pausar, retomar): a lista troca a linha. */
  aoMudarConversa: (c: ConversaDto) => void;
};

/**
 * O fio de UMA conversa: mensagens (mais novas primeiro na rota, em ordem de leitura aqui), marcas, janela da Meta e
 * pausa do robô. Resposta atrasada de uma conversa que já foi fechada na tela nunca entra na seguinte.
 */
export function useFio(id: string | null, { aoMudarConversa }: Opcoes) {
  const [mensagens, setMensagens] = useState<MensagemDto[]>([]);
  const [proximo, setProximo] = useState<string | null>(null);
  const [marcas, setMarcas] = useState<MarcaDoFio[]>([]);
  const [janela, setJanela] = useState<Janela>(SEM_JANELA);
  const [pausadoAte, setPausadoAte] = useState<string | null>(null);
  const [carga, setCarga] = useState<CargaDoFio>("carregando");
  const [erroDaCarga, setErroDaCarga] = useState<string | null>(null);
  const [buscandoAntigas, setBuscandoAntigas] = useState(false);
  const [viuOk, setViuOk] = useState(false);
  const sequencia = useRef(criarSequencia());
  const emVoo = useRef(false);
  const sujo = useRef(false);
  const idAtual = useRef(id);
  const ultimoEnvio = useRef<{ assinatura: string; chave: string } | null>(null);
  const aoMudar = useRef(aoMudarConversa);
  useEffect(() => {
    idAtual.current = id;
    aoMudar.current = aoMudarConversa;
  });

  const url = (sufixo = "") => `/api/ig/conversations/${idAtual.current}${sufixo}`;

  /** `inicial` troca tudo; sem ele, só junta o que chegou (a posição de leitura não pula). */
  const carregar = useCallback(async (conversa: string, inicial: boolean) => {
    // Cada pedido leva um carimbo; só o mais novo grava (resposta atrasada não desfaz janela, marcas nem pausa).
    const meu = sequencia.current.novo();
    if (inicial) {
      setCarga("carregando");
      setErroDaCarga(null);
    }
    try {
      const r = await fetch(`/api/ig/conversations/${conversa}/messages`, { cache: "no-store" });
      if (conversa !== idAtual.current || !sequencia.current.atual(meu)) return;
      if (!r.ok) {
        if (!inicial) return;
        setErroDaCarga((await lerCorpo(r))?.error ?? null);
        setCarga(r.status === 404 ? "nao-achou" : "erro");
        return;
      }
      const fio = (await r.json()) as FioDaConversa;
      if (conversa !== idAtual.current || !sequencia.current.atual(meu)) return;
      setViuOk(true);
      setMensagens((atuais) => (inicial ? mesclarMensagens([], fio.mensagens) : mesclarMensagens(atuais, fio.mensagens)));
      if (inicial) setProximo(fio.proximo);
      setMarcas(fio.marcas);
      setJanela(fio.janela);
      setPausadoAte(fio.roboPausadoAte);
      setCarga("ok");
    } catch {
      if (inicial && conversa === idAtual.current && sequencia.current.atual(meu)) setCarga("erro");
    }
  }, []);

  useEffect(() => {
    setMensagens([]);
    setViuOk(false);
    emVoo.current = false;
    sujo.current = false;
    setProximo(null);
    setMarcas([]);
    setJanela(SEM_JANELA);
    setPausadoAte(null);
    ultimoEnvio.current = null;
    if (id) void carregar(id, true);
  }, [id, carregar]);

  /** Uma busca por vez (cada uma vai à Zernio): pedido durante a busca marca "sujo" e roda UMA a mais ao terminar. */
  const recarregarNovas = useCallback(() => {
    const conversa = idAtual.current;
    if (!conversa) return;
    if (emVoo.current) {
      sujo.current = true;
      return;
    }
    emVoo.current = true;
    void carregar(conversa, false).finally(() => {
      emVoo.current = false;
      if (sujo.current && conversa === idAtual.current) {
        sujo.current = false;
        recarregarNovas();
      }
    });
  }, [carregar]);

  const maisAntigas = useCallback(async () => {
    const conversa = idAtual.current;
    if (!conversa || !proximo || buscandoAntigas) return;
    setBuscandoAntigas(true);
    try {
      const r = await fetch(`/api/ig/conversations/${conversa}/messages?cursor=${encodeURIComponent(proximo)}`, { cache: "no-store" });
      if (conversa !== idAtual.current || !r.ok) return;
      const fio = (await r.json()) as FioDaConversa;
      setMensagens((atuais) => mesclarMensagens(atuais, fio.mensagens));
      setProximo(fio.proximo);
    } catch {
      // Fica o botão "Ver mensagens anteriores" para tentar de novo.
    } finally {
      setBuscandoAntigas(false);
    }
  }, [proximo, buscandoAntigas]);

  /**
   * Uma tentativa de mandar pela loja (texto, mídia ou convite). A chave de idempotência é uma por tentativa e a MESMA
   * no reenvio do mesmo conteúdo (`assinatura`): a Zernio não duplica.
   */
  const postar = useCallback(
    async (sufixo: string, assinatura: string, corpo: Record<string, unknown>): Promise<Resultado> => {
      if (!idAtual.current) return { ok: false, mensagem: "Abra uma conversa primeiro." };
      const chave = ultimoEnvio.current?.assinatura === assinatura ? ultimoEnvio.current.chave : crypto.randomUUID();
      ultimoEnvio.current = { assinatura, chave };
      try {
        const r = await fetch(url(sufixo), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...corpo, idempotencyKey: chave }) });
        if (!r.ok) {
          const resposta = await lerCorpo(r);
          // A janela fechou enquanto a loja escrevia: o campo troca para o estado fechado.
          if (r.status === 409 && resposta?.code === "janela_fechada") setJanela((j) => ({ ...j, estado: "fechada" }));
          return { ok: false, mensagem: resposta?.error ?? "Não deu pra enviar. Tente de novo." };
        }
        ultimoEnvio.current = null;
        recarregarNovas();
        return { ok: true };
      } catch {
        return FALHA_DE_REDE;
      }
    },
    [recarregarNovas],
  );

  const enviar = useCallback((e: Envio): Promise<Resultado> => postar("/messages", `${e.texto ?? ""}|${e.midiaId ?? ""}`, { texto: e.texto, midiaId: e.midiaId }), [postar]);
  const convidar = useCallback((campanhaId: string): Promise<Resultado> => postar("/invite", `convite|${campanhaId}`, { campanhaId }), [postar]);

  const agir = useCallback(
    async (acao: AcaoDaConversa): Promise<Resultado> => {
      if (!idAtual.current) return { ok: false, mensagem: "Abra uma conversa primeiro." };
      try {
        const r = await fetch(url(), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ acao }) });
        if (!r.ok) return { ok: false, mensagem: (await lerCorpo(r))?.error ?? "Não deu pra salvar. Tente de novo." };
        const { conversa } = (await r.json()) as { conversa: ConversaDto };
        setPausadoAte(conversa.roboPausadoAte);
        aoMudar.current(conversa);
        recarregarNovas();
        return { ok: true };
      } catch {
        return FALHA_DE_REDE;
      }
    },
    [recarregarNovas],
  );

  return { viuOk, mensagens, proximo, marcas, janela, pausadoAte, carga, erroDaCarga, buscandoAntigas, recarregar: () => id && void carregar(id, true), recarregarNovas, maisAntigas, enviar, convidar, agir };
}
