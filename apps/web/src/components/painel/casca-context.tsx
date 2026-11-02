"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { acessoRestrito, podeAcessar } from "@/lib/auth/modulos";
import { lerStatusDoRecuperar, liberacoesDaCasca, type RecuperarNaCasca } from "@/lib/painel/casca";
import type { Liberacoes } from "@/lib/painel-nav";
import { useRecarga } from "./home/ao-vivo/use-recarga";
import { useRole } from "./role-provider";

/** O que `GET /api/ig/status` devolve. */
export type StatusInstagram = {
  enabled: boolean;
  account: { username: string; status: string } | null;
  live: number;
  /** Atendimentos iniciados na última hora (teto de 700/h por conta). */
  startedLastHour: number;
};

type CascaCtx = {
  /** Modo foco: a tela toma a janela inteira (editor de fluxo). A barra de cima e a barra inferior somem. */
  foco: boolean;
  definirFoco: (ligado: boolean) => void;
  /** null enquanto a casca não perguntou; com a API fora vira `enabled: false`. */
  instagram: StatusInstagram | null;
  /** null enquanto a casca não perguntou; falha na rede NÃO vira `enabled: false` (ver `recuperarFalhou`). */
  recuperar: RecuperarNaCasca | null;
  /** A última pergunta do Recuperar falhou. `recuperar` guarda o estado anterior. */
  recuperarFalhou: boolean;
  liberacoes: Liberacoes | null;
  recarregarInstagram: () => void;
  recarregarRecuperar: () => void;
};

const CascaContext = createContext<CascaCtx>({
  foco: false,
  definirFoco: () => {},
  instagram: null,
  recuperar: null,
  recuperarFalhou: false,
  liberacoes: null,
  recarregarInstagram: () => {},
  recarregarRecuperar: () => {},
});

export const useCasca = () => useContext(CascaContext);

/** Liga o modo foco enquanto o componente estiver montado. */
export function useFoco() {
  const { definirFoco } = useCasca();
  useEffect(() => {
    definirFoco(true);
    return () => definirFoco(false);
  }, [definirFoco]);
}

const DESLIGADO: StatusInstagram = { enabled: false, account: null, live: 0, startedLastHour: 0 };

/** O Recuperar atualiza o contador "precisa de você" no menu enquanto a aba está visível. */
const RECUPERAR_RECARGA_MS = 30_000;

/**
 * O layout não remonta entre rotas, então o valor sobrevive à navegação: o
 * status do Instagram é uma pergunta por sessão do painel, e o item do menu
 * aparece (ou não) em todas as telas.
 */
export function CascaProvider({ children }: { children: React.ReactNode }) {
  const [foco, definirFoco] = useState(false);
  const [instagram, setInstagram] = useState<StatusInstagram | null>(null);
  const [recuperar, setRecuperar] = useState<RecuperarNaCasca | null>(null);
  const [recuperarFalhou, setRecuperarFalhou] = useState(false);
  const [versao, setVersao] = useState(0);
  const recarregarInstagram = useCallback(() => setVersao((v) => v + 1), []);
  const { carregado, acesso } = useRole();
  // Espera saber quem é: a vendedora (e papel desconhecido) não tem Instagram, e a pergunta daria 403
  // (spec 2026-10-07 §1). Para eles `instagram` fica null — o item do menu já não aparece por não ter módulo.
  const pergunta = carregado && !acessoRestrito(acesso);
  // Recuperar: dono, admin e operador sempre; vendedora só com o módulo; papel desconhecido nunca.
  const perguntaRecuperar = carregado && acesso !== null && podeAcessar(acesso, "/api/recuperar/status", "GET");

  useEffect(() => {
    if (!pergunta) return;
    let cancelado = false;
    fetch("/api/ig/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: StatusInstagram | null) => {
        if (cancelado) return;
        setInstagram(raw && typeof raw.enabled === "boolean" ? { enabled: raw.enabled, account: raw.account ?? null, live: Number(raw.live) || 0, startedLastHour: Number(raw.startedLastHour) || 0 } : DESLIGADO);
      })
      .catch(() => {
        if (!cancelado) setInstagram(DESLIGADO);
      });
    return () => {
      cancelado = true;
    };
  }, [versao, pergunta]);

  // Resposta válida grava o estado; qualquer outra coisa (rede, não-2xx, corpo inválido) só marca a falha
  // e deixa o estado anterior: "não consegui perguntar" não é "desligado".
  const buscarRecuperar = useCallback(() => {
    fetch("/api/recuperar/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => {
        const lido = lerStatusDoRecuperar(raw);
        if (!lido) return setRecuperarFalhou(true);
        // Mesmo valor, mesma referência: a recarga de 30 s não re-renderiza quem consome o contexto.
        setRecuperar((atual) =>
          atual && atual.enabled === lido.enabled && atual.precisaDeVoce === lido.precisaDeVoce ? atual : lido,
        );
        setRecuperarFalhou(false);
      })
      .catch(() => setRecuperarFalhou(true));
  }, []);

  useEffect(() => {
    if (perguntaRecuperar) buscarRecuperar();
  }, [perguntaRecuperar, buscarRecuperar]);

  // Recarrega enquanto o add-on está ligado e também enquanto a primeira leitura não deu certo
  // (sem estado e com falha): um erro não pode esconder o módulo de uma loja que paga, então a
  // casca se cura sozinha a cada 30 s em vez de esperar um reload.
  useRecarga(
    buscarRecuperar,
    RECUPERAR_RECARGA_MS,
    perguntaRecuperar && (recuperar?.enabled === true || (recuperar === null && recuperarFalhou)),
  );

  const valor = useMemo<CascaCtx>(
    () => ({
      foco,
      definirFoco,
      instagram,
      recuperar,
      recuperarFalhou,
      liberacoes: liberacoesDaCasca({
        perguntouInstagram: pergunta,
        instagram,
        perguntouRecuperar: perguntaRecuperar,
        recuperar,
        recuperarFalhou,
      }),
      recarregarInstagram,
      recarregarRecuperar: buscarRecuperar,
    }),
    [foco, instagram, recuperar, recuperarFalhou, pergunta, perguntaRecuperar, recarregarInstagram, buscarRecuperar],
  );
  return <CascaContext.Provider value={valor}>{children}</CascaContext.Provider>;
}
