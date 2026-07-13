"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Smartphone, ShieldCheck, Zap, Loader2, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

export default function PainelConectar() {
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-10 sm:px-8">
      {/* Boas-vindas */}
      <div className="text-center">
        <span className="font-data inline-flex items-center gap-2 rounded-full bg-poco px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-aco/60">
          <Zap className="h-3 w-3 text-iris" /> Primeiro acesso
        </span>
        <h1 className="font-display mt-4 text-4xl font-extrabold tracking-[-0.035em] text-breu">
          Vamos conectar seu WhatsApp
        </h1>
        <p className="font-editorial mx-auto mt-2 max-w-md text-[19px] italic text-ardosia">
          É o seu número de sempre, com seus grupos. Leva 2 minutos e nada técnico.
        </p>
      </div>

      <Stepper />

      <div className="pn-card mt-10 grid gap-6 overflow-hidden rounded-2xl md:grid-cols-2">
        <Instrucoes />
        <QRPanel />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Link href="/painel" className="text-sm text-aco/60 transition-colors duration-[160ms] hover:text-breu">
          Pular por agora
        </Link>
        <Link
          href="/painel/conectar"
          className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
        >
          <Smartphone className="h-4 w-4" /> Atualizar
        </Link>
      </div>
    </div>
  );
}

const STEPS = [
  { n: 1, label: "Conectar número", active: true, done: false },
  { n: 2, label: "Grupos entram", active: false, done: false },
  { n: 3, label: "Primeira campanha", active: false, done: false },
];

function Stepper() {
  return (
    <ol className="mx-auto mt-8 flex max-w-xl items-center">
      {STEPS.map((s, i) => (
        <li key={s.n} className="flex flex-1 items-center last:flex-none">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full font-data text-sm font-medium tabular-nums",
                s.active ? "bg-iris text-white" : "bg-poco text-aco/50",
              )}
            >
              {s.done ? <Check className="h-4 w-4" /> : s.n}
            </span>
            <span
              className={cn(
                "hidden text-sm sm:inline",
                s.active ? "font-medium text-breu" : "text-aco/50",
              )}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && <span className="mx-3 h-px flex-1 bg-breu/10" />}
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
      <h2 className="font-display text-xl font-bold text-breu">Como conectar</h2>
      <ol className="mt-5 space-y-4">
        {INSTRUCTIONS.map((t, i) => (
          <li key={t} className="flex items-start gap-3">
            <span className="font-data flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-iris/10 text-xs font-medium tabular-nums text-iris">
              {i + 1}
            </span>
            <span className="text-sm text-aco">{t}</span>
          </li>
        ))}
      </ol>
      <div className="mt-7 flex items-center gap-3 rounded-2xl bg-poco px-4 py-3.5">
        <ShieldCheck className="h-5 w-5 shrink-0 text-iris" />
        <p className="text-xs text-aco">
          Conexão segura e dentro da LGPD. Seus contatos são seus — desconectou, leva tudo.
        </p>
      </div>
    </div>
  );
}

type EngineState = {
  ok: boolean;
  whatsappConnected: boolean;
  connectedNumber: string | null;
  qr: string | null;
  error?: string;
};

function QRPanel() {
  const [state, setState] = useState<EngineState>({
    ok: false,
    whatsappConnected: false,
    connectedNumber: null,
    qr: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchState(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const r = await fetch("/api/engine?action=status", { cache: "no-store" });
      const data = (await r.json()) as EngineState;
      setState(data);
      setError(data.error ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchState(true);
    const id = setInterval(() => fetchState(false), 4000);
    return () => clearInterval(id);
  }, []);

  if (state.whatsappConnected) {
    return <ConnectedPanel number={state.connectedNumber} />;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-5 bg-breu p-7 text-white sm:p-9">
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
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
            <Loader2 className="h-8 w-8 animate-spin text-bruma/60" />
          ) : (
            <span className="px-3 text-center font-data text-[11px] uppercase tracking-wider text-bruma/60">
              Aguardando QR…
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-bruma/70">
        <span className={cn("hf-breathe h-2 w-2 rounded-full", state.qr ? "bg-iris-claro" : "bg-bruma/40")} />
        {state.qr ? "Escaneie no WhatsApp" : "Aguardando leitura…"}
      </div>

      <button
        type="button"
        onClick={() => fetchState(true)}
        className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-bruma/50 transition-colors duration-[160ms] hover:text-bruma/80"
      >
        <RefreshCw className="h-3 w-3" /> Atualizar agora
      </button>

      <p className="font-data text-center text-[11px] uppercase tracking-wider text-bruma/40">
        o código expira em 60s · gera outro automático
      </p>
    </div>
  );
}

function ConnectedPanel({ number }: { number: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 bg-breu p-7 text-white sm:p-9">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/20">
        <Check className="h-10 w-10 text-emerald-300" strokeWidth={3} />
      </div>
      <div className="text-center">
        <p className="font-display text-lg font-bold">WhatsApp conectado!</p>
        {number && <p className="font-data mt-1 text-sm text-bruma/70">+{number}</p>}
      </div>
      <Link
        href="/painel"
        className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
      >
        Ir para o painel
      </Link>
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
