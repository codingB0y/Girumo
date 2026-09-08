"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toPlanLimitError, upgradeUrlFrom } from "@/lib/billing/plan-limit-client";
import { ConectarVitrine } from "@/components/painel/conectar/vitrine/conectar-vitrine";
import { POLL_MS, WATCH_MS, nextPollDelay } from "@/lib/engine-poll";
import { selectSessionRow } from "@/lib/session-select";
import type { NumeroPerfilDeclarado } from "@/lib/instances/numero-perfil";

/**
 * A casa do número — três estados na mesma rota.
 *
 * Esta rota é o que a sidebar e a topbar linkam, e é o único lugar onde vivem a
 * saúde do número e a proteção dos grupos. Mas ela se apresentava como
 * "Primeiro acesso", com um wizard de três passos, SEMPRE: quem conectou meses
 * atrás e vinha só olhar o anti-ban levava um onboarding na cara toda vez.
 *
 * O onboarding agora só existe enquanto ele é verdade. O que separa os estados
 * é `connected_at` — o carimbo do primeiro pareamento, que nunca é apagado:
 *
 *   sem `connected_at`  → primeiro acesso: o wizard completo
 *   com, mas caiu       → reconexão: o QR sem o discurso de boas-vindas
 *   conectado           → "Seu número": estado, saúde e proteção
 */
export default function PainelConectar() {
  const {
    instance,
    loading,
    error,
    upgradeUrl,
    precisaPerfil,
    load,
    refreshQr,
    disconnect,
    onEscolherPerfil,
  } = useInstance();

  // PR 8 da Vitrine Aberta: o cartão do número e o código na caixinha Canvas.
  // Todo o estado acima continua aqui — só o desenho muda.
  return (
    <ConectarVitrine
      instancia={instance}
      carregando={loading}
      erro={error}
      upgradeUrl={upgradeUrl}
      precisaPerfil={precisaPerfil}
      onAtualizar={() => load(true)}
      onRefreshQr={refreshQr}
      onDesconectar={disconnect}
      onEscolherPerfil={onEscolherPerfil}
    />
  );
}

type InstanceStatus =
  | "pending"
  | "qr"
  | "connecting"
  | "connected"
  | "disconnected"
  | "blocked"
  | "error";

type Instance = {
  id: string;
  name: string;
  phone: string | null;
  status: InstanceStatus;
  qr_code: string | null;
  /** Primeiro pareamento bem-sucedido. Nunca volta a ser null. */
  connected_at: string | null;
  /** Usado por `selectSessionRow` para desempatar entre linhas do tenant. */
  updated_at: string | null;
  /** Guarda `lastDisconnectReason` — ver o webhook de `connection.update`. */
  metadata?: Record<string, unknown> | null;
};

/**
 * Instância da Evolution + o ritmo de consulta.
 *
 * Vive acima dos painéis porque o cabeçalho, a saúde e a proteção também
 * precisam saber se já conectou — antes o estado era privado do QRPanel.
 */
function useInstance() {
  const [instance, setInstance] = useState<Instance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);
  // Sem instância e sem resposta do lojista: a criação espera a pergunta.
  const [precisaPerfil, setPrecisaPerfil] = useState(false);
  const delayRef = useRef(POLL_MS);
  // Guarda contra o polling disparar uma segunda criação antes da primeira
  // responder — cada POST cria uma instância de verdade na Evolution.
  const creating = useRef(false);
  // Idem para o sync inicial: o polling continua rodando enquanto ele responde.
  const synced = useRef(false);
  // Resposta do "número é novo?" — ref, não state: `load` é um `useCallback`
  // com polling, e ler de state ali seria closure velha (sempre `null`).
  const perfilRef = useRef<NumeroPerfilDeclarado | null>(null);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch("/api/instances", { cache: "no-store" });
      // Sessao morta: o 401 do servidor ja apagou o cookie, entao ir para o
      // login e o unico passo que falta. Sem isto a tela repetia "nao foi
      // possivel carregar a instancia" a cada ciclo do polling — mensagem que
      // faz o lojista achar que o WhatsApp dele caiu, quando ele so precisa
      // entrar de novo.
      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname);
        window.location.href = `/login?next=${next}`;
        return null;
      }
      if (!res.ok) throw new Error("Nao foi possivel carregar a instancia.");
      const list = (await res.json()) as Instance[];

      if (list.length === 0) {
        // Sem número novo ou antigo declarado, a criação espera: é essa
        // resposta que decide o teto inicial de envio (ver numero-perfil.ts).
        if (!perfilRef.current) {
          setPrecisaPerfil(true);
          return null;
        }
        if (creating.current) return null;
        creating.current = true;
        const created = await fetch("/api/instances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "WhatsApp", numero_perfil: perfilRef.current }),
        });
        if (!created.ok) {
          throw await toPlanLimitError(created, "Nao foi possivel criar a instancia.");
        }
        // O QR chega logo em seguida pelo webhook; o próximo ciclo o pega.
        const nova = (await created.json()) as Instance;
        setInstance(nova);
        setError(null);
        delayRef.current = nextPollDelay(delayRef.current, "ok");
        return nova;
      }

      // `list[0]` era a instância mais ANTIGA (a API ordena por `created_at`
      // ascendente). Um tenant com mais de uma linha — que acontece, e é por
      // isso que `session-select` existe — via a tela travada numa instância
      // morta em `qr` enquanto a conectada estava logo atrás na lista.
      const escolhida = selectSessionRow(list) ?? list[0] ?? null;
      setInstance(escolhida);
      setError(null);
      delayRef.current = nextPollDelay(delayRef.current, "ok");
      return escolhida;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUpgradeUrl(upgradeUrlFrom(e));
      // Evolution fora do ar: espaça em vez de martelar de 4 em 4 segundos.
      delayRef.current = nextPollDelay(delayRef.current, "error");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Dispara a ação e adota a instância devolvida, que já vem com estado fresco. */
  const runAction = useCallback(
    async (id: string, action: "refresh_qr" | "disconnect", falha: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/instances/${id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          // A API explica os casos conhecidos (pedir QR com a sessão viva, por
          // exemplo); a mensagem genérica é só o último recurso.
          const detalhe = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(detalhe?.error || falha);
        }
        setInstance((await res.json()) as Instance);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Pede um QR novo.
   *
   * Sem instância carregada isto era `return void load(true)`: o clique
   * recarregava a lista e NUNCA pedia QR, sem dizer nada na tela — quem clicava
   * ficava em "Aguardando QR…" para sempre, sem erro nenhum para investigar.
   */
  const refreshQr = useCallback(async () => {
    const alvo = instance ?? (await load(true));
    if (!alvo) return; // `load` já colocou o motivo em `error`.
    await runAction(alvo.id, "refresh_qr", "Nao foi possivel gerar um novo QR.");
  }, [instance, load, runAction]);

  /**
   * Encerra a sessão na Evolution.
   *
   * É a saída para trocar de número e para quando o pareamento entra em ciclo
   * (a sessão abre e cai sozinha, repetidamente).
   */
  const disconnect = useCallback(async () => {
    if (!instance) return;
    await runAction(instance.id, "disconnect", "Nao foi possivel desconectar.");
  }, [instance, runAction]);

  /** Resposta da pergunta do perfil: guarda na ref e libera a criação. */
  const onEscolherPerfil = useCallback(
    (perfil: NumeroPerfilDeclarado) => {
      perfilRef.current = perfil;
      setPrecisaPerfil(false);
      void load(true);
    },
    [load],
  );

  /**
   * Polling que muda de ritmo, mas não desiste.
   *
   * Antes dava `return` ao ver `connected` e nunca mais perguntava. A sessão cai
   * sozinha (celular sem internet, a vaga de aparelho tomada, os 14 dias de
   * inatividade) e a tela seguia mostrando "conectado" com o número fora do ar
   * até alguém dar F5. Conectado, a cadência cai para meio minuto — o bastante
   * para notar a queda, barato o bastante para deixar a aba aberta.
   */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let firstRun = true;

    const tick = async () => {
      timer = null;
      if (cancelled) return;

      if (!firstRun && document.visibilityState === "hidden") {
        timer = setTimeout(tick, delayRef.current);
        return;
      }
      const isFirst = firstRun;
      firstRun = false;

      // Só a primeira consulta acende o spinner; as do ciclo são silenciosas.
      const result = await load(isFirst);
      if (cancelled) return;

      timer = setTimeout(tick, result?.status === "connected" ? WATCH_MS : delayRef.current);
    };

    void tick();

    const onVisibilityChange = () => {
      if (cancelled || document.visibilityState !== "visible" || timer === null) return;
      clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  /**
   * Importa os grupos assim que a conexão abre.
   *
   * A Evolution só emite `groups.upsert` para grupos criados DEPOIS da conexão;
   * os que já existiam nunca chegariam por webhook. Sem este fetch inicial, a
   * tela de grupos fica vazia para sempre.
   *
   * Falha aqui é silenciosa de propósito: a conexão deu certo, e o usuário tem
   * o botão "Sincronizar grupos" no painel de grupos como caminho explícito.
   */
  useEffect(() => {
    if (instance?.status !== "connected" || synced.current) return;
    synced.current = true;
    void fetch("/api/groups/sync", { method: "POST" }).catch(() => undefined);
  }, [instance?.status]);

  return {
    instance,
    loading,
    error,
    upgradeUrl,
    precisaPerfil,
    load,
    refreshQr,
    disconnect,
    onEscolherPerfil,
  };
}
