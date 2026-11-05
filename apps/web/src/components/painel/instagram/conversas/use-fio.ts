"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MarcaDoFio } from "@/lib/ig/conversas/fio";
import { mesclarMensagens } from "@/lib/ig/conversas/tela";
import type { ConversaDto, FioDaConversa, MensagemDto } from "@/lib/ig/conversas/tipos";

export type CargaDoFio = "carregando" | "ok" | "erro" | "nao-achou";
export type Resultado = { ok: true } | { ok: false; mensagem: string };
export type AcaoDaConversa = "resolver" | "pausar" | "retomar";

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
  const idAtual = useRef(id);
  const ultimoEnvio = useRef<{ texto: string; chave: string } | null>(null);
  const aoMudar = useRef(aoMudarConversa);
  useEffect(() => {
    idAtual.current = id;
    aoMudar.current = aoMudarConversa;
  });

  const url = (sufixo = "") => `/api/ig/conversations/${idAtual.current}${sufixo}`;

  /** `inicial` troca tudo; sem ele, só junta o que chegou (a posição de leitura não pula). */
  const carregar = useCallback(async (conversa: string, inicial: boolean) => {
    if (inicial) {
      setCarga("carregando");
      setErroDaCarga(null);
    }
    try {
      const r = await fetch(`/api/ig/conversations/${conversa}/messages`, { cache: "no-store" });
      if (conversa !== idAtual.current) return;
      if (!r.ok) {
        if (!inicial) return;
        setErroDaCarga((await lerCorpo(r))?.error ?? null);
        setCarga(r.status === 404 ? "nao-achou" : "erro");
        return;
      }
      const fio = (await r.json()) as FioDaConversa;
      if (conversa !== idAtual.current) return;
      setMensagens((atuais) => (inicial ? mesclarMensagens([], fio.mensagens) : mesclarMensagens(atuais, fio.mensagens)));
      if (inicial) setProximo(fio.proximo);
      setMarcas(fio.marcas);
      setJanela(fio.janela);
      setPausadoAte(fio.roboPausadoAte);
      setCarga("ok");
    } catch {
      if (inicial && conversa === idAtual.current) setCarga("erro");
    }
  }, []);

  useEffect(() => {
    setMensagens([]);
    setProximo(null);
    setMarcas([]);
    setJanela(SEM_JANELA);
    setPausadoAte(null);
    ultimoEnvio.current = null;
    if (id) void carregar(id, true);
  }, [id, carregar]);

  const recarregarNovas = useCallback(() => {
    if (idAtual.current) void carregar(idAtual.current, false);
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

  /** A chave de idempotência é uma por tentativa e a MESMA no reenvio do mesmo texto. */
  const enviar = useCallback(
    async (texto: string): Promise<Resultado> => {
      if (!idAtual.current) return { ok: false, mensagem: "Abra uma conversa primeiro." };
      const chave = ultimoEnvio.current?.texto === texto ? ultimoEnvio.current.chave : crypto.randomUUID();
      ultimoEnvio.current = { texto, chave };
      try {
        const r = await fetch(url("/messages"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto, idempotencyKey: chave }) });
        if (!r.ok) {
          const corpo = await lerCorpo(r);
          // A janela fechou enquanto a loja escrevia: o campo troca para o estado fechado.
          if (r.status === 409 && corpo?.code === "janela_fechada") setJanela((j) => ({ ...j, estado: "fechada" }));
          return { ok: false, mensagem: corpo?.error ?? "Não deu pra enviar. Tente de novo." };
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

  return { mensagens, proximo, marcas, janela, pausadoAte, carga, erroDaCarga, buscandoAntigas, recarregar: () => id && void carregar(id, true), recarregarNovas, maisAntigas, enviar, agir };
}
