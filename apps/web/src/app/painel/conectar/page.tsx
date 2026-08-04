"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck, Zap, Loader2, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { POLL_MS, nextPollDelay } from "@/lib/engine-poll";

export default function PainelConectar() {
  const { state, loading, error, refresh } = useEngineStatus();
  const connected = state.whatsappConnected;

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-10 sm:px-8">
      {/* Boas-vindas */}
      <div className="text-center">
        <span className="font-data inline-flex items-center gap-2 rounded-full bg-poco px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-aco/60">
          <Zap className="h-3 w-3 text-cobalt-500" /> Primeiro acesso
        </span>
        <h1 className="font-display mt-4 text-4xl font-extrabold tracking-[-0.035em] text-volt-950">
          {connected ? "WhatsApp conectado" : "Vamos conectar seu WhatsApp"}
        </h1>
        <p className="font-editorial mx-auto mt-2 max-w-md text-[19px] italic text-ardosia">
          {connected
            ? "Seus grupos já estão entrando. Agora é criar a primeira campanha."
            : "É o seu número de sempre, com seus grupos. Leva 2 minutos e nada técnico."}
        </p>
      </div>

      <Stepper connected={connected} />

      <div className="pn-card mt-10 grid gap-6 overflow-hidden rounded-2xl md:grid-cols-2">
        <Instrucoes />
        <QRPanel state={state} loading={loading} error={error} onRefresh={() => void refresh(true)} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Link href="/painel" className="text-sm text-aco/60 transition-colors duration-[160ms] hover:text-volt-950">
          {connected ? "Ir para o painel" : "Pular por agora"}
        </Link>
        <button
          type="button"
          onClick={() => void refresh(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {loading ? "Verificando…" : "Atualizar"}
        </button>
      </div>
    </div>
  );
}

// ---------- Estado da engine ----------

type EngineState = {
  ok: boolean;
  whatsappConnected: boolean;
  connectedNumber: string | null;
  qr: string | null;
  error?: string;
};

const INITIAL_STATE: EngineState = {
  ok: false,
  whatsappConnected: false,
  connectedNumber: null,
  qr: null,
};


/**
 * Status da engine, com polling que sabe parar.
 *
 * Antes era um `setInterval(4000)` que nunca era cancelado: seguia batendo
 * mesmo depois de conectar e mesmo com a aba esquecida em segundo plano —
 * 900 requisições por hora, por lojista, sem nada pra descobrir. Agora o
 * polling para quando conecta, pausa com a aba oculta e espaça as tentativas
 * quando a engine está fora do ar.
 */
function useEngineStatus() {
  const [state, setState] = useState<EngineState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const delayRef = useRef(POLL_MS);

  const refresh = useCallback(async (withSpinner = false): Promise<EngineState | null> => {
    if (withSpinner) setLoading(true);
    try {
      const res = await fetch("/api/engine?action=status", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EngineState;
      setState(data);
      setError(data.error ?? null);
      delayRef.current = nextPollDelay(delayRef.current, "ok");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Engine fora do ar: espaça em vez de martelar de 4 em 4 segundos.
      delayRef.current = nextPollDelay(delayRef.current, "error");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let firstRun = true;

    const tick = async () => {
      timer = null;
      if (cancelled) return;

      // Aba em segundo plano: nada a mostrar, reagenda sem gastar requisição.
      // A primeira busca é exceção e sempre acontece — abrir a página numa aba
      // de fundo não pode deixar a tela em "Verificando…" até o foco voltar.
      if (!firstRun && document.visibilityState === "hidden") {
        timer = setTimeout(tick, delayRef.current);
        return;
      }
      firstRun = false;

      const result = await refresh();
      if (cancelled) return;

      // Conectado: acabou o motivo de perguntar.
      if (result?.whatsappConnected) return;
      timer = setTimeout(tick, delayRef.current);
    };

    void tick();

    // Voltar pra aba deve dar uma resposta imediata, não esperar o ciclo.
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
  }, [refresh]);

  return { state, loading, error, refresh };
}

// ---------- Stepper ----------

function Stepper({ connected }: { connected: boolean }) {
  // Reflete o estado real. Antes era constante de módulo: mesmo depois de
  // conectar, o passo 1 continuava marcado como o atual.
  const steps = [
    { n: 1, label: "Conectar número", done: connected, active: !connected },
    { n: 2, label: "Grupos entram", done: false, active: connected },
    { n: 3, label: "Primeira campanha", done: false, active: false },
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
                s.done
                  ? "bg-sucesso/10 text-sucesso"
                  : s.active
                    ? "bg-cobalt-500 text-white"
                    : "bg-poco text-aco/50",
              )}
            >
              {s.done ? <Check className="h-4 w-4" /> : s.n}
            </span>
            <span
              className={cn(
                "hidden text-sm sm:inline",
                s.active ? "font-medium text-volt-950" : s.done ? "text-aco/70" : "text-aco/50",
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
        <ShieldCheck className="h-5 w-5 shrink-0 text-cobalt-500" />
        <p className="text-xs text-aco">
          Conexão segura e dentro da LGPD. Seus contatos são seus — desconectou, leva tudo.
        </p>
      </div>
    </div>
  );
}

function QRPanel({
  state,
  loading,
  error,
  onRefresh,
}: {
  state: EngineState;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (state.whatsappConnected) {
    return <ConnectedPanel number={state.connectedNumber} />;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-5 bg-volt-950 p-7 text-white sm:p-9">
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200" role="status">
          Engine offline: {error}
        </div>
      )}

      {state.qr ? (
        <div className="rounded-2xl bg-white p-4">
          <RealQR data={state.qr} />
        </div>
      ) : (
        <div className="flex h-[150px] w-[150px] items-center justify-center rounded-2xl bg-white/10">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-canvas-100/60" />
          ) : (
            <span className="px-3 text-center font-data text-[11px] uppercase tracking-wider text-canvas-100/60">
              Aguardando QR…
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-canvas-100/70" role="status">
        <span className={cn("hf-breathe h-2 w-2 rounded-full", state.qr ? "bg-cobalt-500" : "bg-canvas-100/40")} />
        {state.qr ? "Escaneie no WhatsApp" : "Aguardando leitura…"}
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-canvas-100/50 transition-colors duration-[160ms] hover:text-canvas-100/80 disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Atualizar agora
      </button>

      <p className="font-data text-center text-[11px] uppercase tracking-wider text-canvas-100/40">
        o código expira em 60s · gera outro automático
      </p>
    </div>
  );
}

function ConnectedPanel({ number }: { number: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 bg-volt-950 p-7 text-white sm:p-9">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/20">
        <Check className="h-10 w-10 text-emerald-300" strokeWidth={3} />
      </div>
      <div className="text-center">
        <p className="font-display text-lg font-bold">WhatsApp conectado!</p>
        {number && <p className="font-data mt-1 text-sm text-canvas-100/70">+{number}</p>}
      </div>
      <Link
        href="/painel"
        className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
      >
        Ir para o painel
      </Link>
    </div>
  );
}

/**
 * QR Code real a partir do payload da engine.
 *
 * Gerado localmente, no browser. O payload de pareamento ("2@abc...,xyz") dá
 * acesso total à sessão de WhatsApp do lojista — mandá-lo para um gerador de QR
 * de terceiro (era quickchart.io) expunha a sessão a qualquer intermediário que
 * lesse a URL. Nada sai da máquina do lojista.
 */
function RealQR({ data }: { data: string }) {
  return (
    <QRCodeSVG
      value={data}
      size={150}
      level="M"
      marginSize={2}
      title="QR Code para conectar o WhatsApp"
      className="h-[150px] w-[150px]"
    />
  );
}
