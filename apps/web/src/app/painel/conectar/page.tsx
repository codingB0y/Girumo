"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck, Zap, Loader2, RefreshCw, Power, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toPlanLimitError, upgradeUrlFrom } from "@/lib/billing/plan-limit-client";
import { PlanLimitAlert } from "@/components/painel/plan-limit-alert";
import { NumeroSaude } from "@/components/painel/numero-saude";
import { GruposProtecao } from "@/components/painel/grupos-protecao";
import { cn } from "@/lib/utils";
import { POLL_MS, WATCH_MS, nextPollDelay } from "@/lib/engine-poll";
import { precisaParearDeNovo } from "@/lib/instance-disconnect-reason";
import { activationLabel } from "@/lib/onboarding-steps";
import { selectSessionRow } from "@/lib/session-select";

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
  const { instance, loading, error, upgradeUrl, load, refreshQr, disconnect } = useInstance();
  const connected = instance?.status === "connected";
  const jaPareou = Boolean(instance?.connected_at);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-10 sm:px-8">
      {connected ? (
        <ModoNumero
          instance={instance}
          loading={loading}
          error={error}
          onDisconnect={disconnect}
          onReload={load}
        />
      ) : (
        <ModoPareamento
          instance={instance}
          jaPareou={jaPareou}
          loading={loading}
          error={error}
          upgradeUrl={upgradeUrl}
          onRefreshQr={refreshQr}
          onDisconnect={disconnect}
          onReload={load}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Conectado — a tela deixa de ser sobre parear e passa a ser sobre operar.    */
/* -------------------------------------------------------------------------- */

function ModoNumero({
  instance,
  loading,
  error,
  onDisconnect,
  onReload,
}: {
  instance: Instance | null;
  loading: boolean;
  /** Falha de "desconectar" ou da consulta. Sem isto o botão falhava calado. */
  error: string | null;
  onDisconnect: () => void;
  onReload: (showSpinner?: boolean) => void;
}) {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-[-0.035em] text-volt-950">
            Seu número
          </h1>
          <p className="font-editorial mt-2 max-w-md text-[19px] italic text-ardosia">
            Conectado e trabalhando. Aqui você acompanha o ritmo que protege ele de bloqueio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onReload(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-volt-950/10 px-4 py-2 text-sm text-aco transition-colors duration-[160ms] hover:bg-poco disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {loading ? "Verificando…" : "Atualizar"}
        </button>
      </header>

      <section className="pn-card mt-8 flex flex-wrap items-center justify-between gap-5 rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sucesso/10">
            <Check className="h-6 w-6 text-sucesso" strokeWidth={3} aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-lg font-bold text-volt-950">WhatsApp conectado</p>
            <p className="font-data mt-0.5 flex items-center gap-1.5 text-sm text-aco/70">
              <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
              {instance?.phone ? `+${instance.phone}` : instance?.name}
            </p>
          </div>
        </div>

        {/* A saída deliberada. Até 31/08/2026 a ação existia na API sem nenhuma
            tela chamá-la — o lojista não tinha como trocar de número sozinho. */}
        <button
          type="button"
          onClick={onDisconnect}
          disabled={loading}
          className="font-data inline-flex items-center gap-1.5 rounded-xl border border-volt-950/10 px-4 py-2 text-[11px] uppercase tracking-wider text-aco/60 transition-colors duration-[160ms] hover:border-red-300 hover:text-red-600 disabled:opacity-50"
        >
          <Power className="h-3.5 w-3.5" aria-hidden="true" /> Desconectar
        </button>
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}

      <NumeroSaude />
      <GruposProtecao />

      <div className="mt-8">
        <Link
          href="/painel"
          className="text-sm text-aco/60 transition-colors duration-[160ms] hover:text-volt-950"
        >
          ← Voltar ao painel
        </Link>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sem sessão — parear pela primeira vez ou reconectar.                        */
/* -------------------------------------------------------------------------- */

function ModoPareamento({
  instance,
  jaPareou,
  loading,
  error,
  upgradeUrl,
  onRefreshQr,
  onDisconnect,
  onReload,
}: {
  instance: Instance | null;
  /** Já houve pareamento antes: isto é reconexão, não primeiro acesso. */
  jaPareou: boolean;
  loading: boolean;
  error: string | null;
  upgradeUrl: string | null;
  onRefreshQr: () => void;
  onDisconnect: () => void;
  onReload: (showSpinner?: boolean) => void;
}) {
  return (
    <>
      <div className="text-center">
        {/* "Primeiro acesso" só quando é, de fato, o primeiro. */}
        {!jaPareou && (
          <span className="font-data inline-flex items-center gap-2 rounded-full bg-poco px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-aco/60">
            <Zap className="h-3 w-3 text-cobalt-500" aria-hidden="true" /> Primeiro acesso
          </span>
        )}
        <h1
          className={cn(
            "font-display text-4xl font-extrabold tracking-[-0.035em] text-volt-950",
            !jaPareou && "mt-4",
          )}
        >
          {jaPareou ? "Reconecte seu WhatsApp" : "Vamos conectar seu WhatsApp"}
        </h1>
        <p className="font-editorial mx-auto mt-2 max-w-md text-[19px] italic text-ardosia">
          {jaPareou
            ? "A sessão caiu. Escaneie o código uma vez e seus grupos voltam sozinhos."
            : "É o seu número de sempre, com seus grupos. Leva 2 minutos e nada técnico."}
        </p>
      </div>

      {/* O roteiro de três passos é material de onboarding: quem já pareou uma
          vez não está começando, está consertando. */}
      {!jaPareou && <Stepper />}

      <div className="pn-card mt-10 grid gap-6 overflow-hidden rounded-2xl md:grid-cols-2">
        <Instrucoes />
        <QRPanel
          instance={instance}
          loading={loading}
          error={error}
          upgradeUrl={upgradeUrl}
          onRefreshQr={onRefreshQr}
          onDisconnect={onDisconnect}
        />
      </div>

      {/* Com histórico, a saúde do número segue na tela mesmo sem sessão: é ela
          que mostra o aquecimento acumulado e o aviso dos 14 dias — justamente
          o que costuma explicar a queda. */}
      {jaPareou && <NumeroSaude />}

      <div className="mt-6 flex items-center justify-between">
        <Link
          href="/painel"
          className="text-sm text-aco/60 transition-colors duration-[160ms] hover:text-volt-950"
        >
          {jaPareou ? "← Voltar ao painel" : "Pular por agora"}
        </Link>
        <button
          type="button"
          onClick={() => onReload(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {loading ? "Verificando…" : "Atualizar"}
        </button>
      </div>
    </>
  );
}

/** O roteiro do primeiro acesso. Rótulos da fonte única (@/lib/onboarding-steps). */
function Stepper() {
  const steps = [
    { n: 1, label: activationLabel("connect"), active: true },
    { n: 2, label: activationLabel("groups"), active: false },
    { n: 3, label: activationLabel("campaign"), active: false },
  ];

  return (
    <ol className="mx-auto mt-8 flex max-w-xl items-center">
      {steps.map((s, i) => (
        <li
          key={s.n}
          className="flex flex-1 items-center last:flex-none"
          aria-current={s.active ? "step" : undefined}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full font-data text-sm font-medium tabular-nums transition-colors duration-[240ms] ease-[var(--ease-fluxo)]",
                s.active ? "bg-cobalt-500 text-white" : "bg-poco text-aco/50",
              )}
            >
              {s.n}
            </span>
            <span
              className={cn(
                "hidden text-sm sm:inline",
                s.active ? "font-medium text-volt-950" : "text-aco/50",
              )}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && <span className="mx-3 h-px flex-1 bg-volt-950/10" />}
        </li>
      ))}
    </ol>
  );
}

const INSTRUCTIONS = [
  "Abra o WhatsApp no seu celular",
  "Toque em Aparelhos conectados",
  "Toque em Conectar um aparelho",
  "Aponte a câmera para o QR Code ao lado",
];

function Instrucoes() {
  return (
    <div className="p-7 sm:p-9">
      <h2 className="font-display text-xl font-bold text-volt-950">Como conectar</h2>
      <ol className="mt-5 space-y-4">
        {INSTRUCTIONS.map((t, i) => (
          <li key={t} className="flex items-start gap-3">
            <span className="font-data flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cobalt-500/10 text-xs font-medium tabular-nums text-cobalt-500">
              {i + 1}
            </span>
            <span className="text-sm text-aco">{t}</span>
          </li>
        ))}
      </ol>
      <div className="mt-7 flex items-center gap-3 rounded-2xl bg-poco px-4 py-3.5">
        <ShieldCheck className="h-5 w-5 shrink-0 text-cobalt-500" aria-hidden="true" />
        <p className="text-xs text-aco">
          Conexão segura e dentro da LGPD. Seus contatos são seus — desconectou, leva tudo.
        </p>
      </div>
    </div>
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
  const delayRef = useRef(POLL_MS);
  // Guarda contra o polling disparar uma segunda criação antes da primeira
  // responder — cada POST cria uma instância de verdade na Evolution.
  const creating = useRef(false);
  // Idem para o sync inicial: o polling continua rodando enquanto ele responde.
  const synced = useRef(false);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch("/api/instances", { cache: "no-store" });
      if (!res.ok) throw new Error("Nao foi possivel carregar a instancia.");
      const list = (await res.json()) as Instance[];

      if (list.length === 0) {
        if (creating.current) return null;
        creating.current = true;
        const created = await fetch("/api/instances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "WhatsApp" }),
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

  return { instance, loading, error, upgradeUrl, load, refreshQr, disconnect };
}

function QRPanel({
  instance,
  loading,
  error,
  upgradeUrl,
  onRefreshQr,
  onDisconnect,
}: {
  instance: Instance | null;
  loading: boolean;
  error: string | null;
  /** Preenchido só quando o erro veio do gate de plano (402). */
  upgradeUrl: string | null;
  onRefreshQr: () => void;
  onDisconnect: () => void;
}) {
  const qr = instance?.qr_code ?? null;
  // "connecting" = pareou e está subindo a sessão; não é erro nem espera de QR.
  const connecting = instance?.status === "connecting";

  return (
    <div className="flex flex-col items-center justify-center gap-5 bg-volt-950 p-7 text-white sm:p-9">
      {/* Conectar um número é o passo 2 do onboarding: barrar aqui sem saída
          trava o cliente logo no começo. */}
      <PlanLimitAlert
        message={error}
        upgradeUrl={upgradeUrl}
        className="flex flex-wrap items-center justify-center gap-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200"
      />

      {/* `401` não é queda passageira: a sessão foi removida e só volta com um
          pareamento novo. Dizer isso evita o clique repetido em "atualizar",
          que é justamente o que substitui a conexão recém-aberta e prende o
          usuário no ciclo. */}
      {precisaParearDeNovo(instance?.metadata) && (
        <p className="max-w-[300px] rounded-lg bg-amber-400/10 px-3 py-2 text-center text-xs leading-relaxed text-amber-200">
          A conexão foi removida no celular. Escaneie o código <strong>uma vez</strong> e
          aguarde — pedir outro código no meio derruba o pareamento em andamento.
        </p>
      )}

      {qr ? (
        <div className="rounded-2xl bg-white p-4">
          <RealQR data={qr} />
        </div>
      ) : (
        <div className="flex h-[150px] w-[150px] items-center justify-center rounded-2xl bg-white/10">
          {loading || connecting ? (
            <Loader2 className="h-8 w-8 animate-spin text-canvas-100/60" aria-hidden="true" />
          ) : (
            <span className="px-3 text-center font-data text-[11px] uppercase tracking-wider text-canvas-100/60">
              Aguardando QR…
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-canvas-100/70">
        <span
          className={cn("hf-breathe h-2 w-2 rounded-full", qr ? "bg-cobalt-500" : "bg-canvas-100/40")}
        />
        {connecting ? "Conectando…" : qr ? "Escaneie no WhatsApp" : "Aguardando leitura…"}
      </div>

      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={onRefreshQr}
          disabled={loading}
          className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-canvas-100/50 transition-colors duration-[160ms] hover:text-canvas-100/80 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Atualizar agora
        </button>

        {/* Saída para quando o pareamento entra em ciclo (a sessão abre e cai
            sozinha): encerra a sessão na Evolution e deixa o próximo QR começar
            limpo. Sem instância não há o que desconectar. */}
        {instance && (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={loading}
            className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-canvas-100/50 transition-colors duration-[160ms] hover:text-red-300 disabled:opacity-50"
          >
            <Power className="h-3 w-3" /> Desconectar
          </button>
        )}
      </div>

      <p className="font-data text-center text-[11px] uppercase tracking-wider text-canvas-100/40">
        o código expira em 60s · gera outro automático
      </p>
    </div>
  );
}

/** QR Code real a partir do payload da engine. */
function RealQR({ data }: { data: string }) {
  // Renderizado 100% local: o payload de pareamento é credencial de sessão
  // do WhatsApp e nunca pode sair do browser (antes ia pra quickchart.io).
  return (
    <QRCodeSVG
      value={data}
      size={150}
      marginSize={2}
      title="QR Code WhatsApp"
      className="h-[150px] w-[150px]"
    />
  );
}
