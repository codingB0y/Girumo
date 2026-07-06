"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Rocket,
} from "lucide-react";
type SeedResult = {
  message: string;
  agents?: number;
  squads?: number;
  missions?: number;
  decisions?: number;
  count?: number;
  error?: string;
};

export default function SquadOSSetupPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<SeedResult | null>(null);

  async function runSeed() {
    setStatus("loading");
    setResult(null);

    try {
      const res = await fetch("/api/squad-os/seed", { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setResult(data);
      } else {
        setStatus("error");
        setResult(data);
      }
    } catch (err) {
      setStatus("error");
      setResult({ message: "Falha na conexão", error: String(err) });
    }
  }

  return (
    <div className="mx-auto max-w-[600px] space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/painel/squad-os"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/50 transition hover:bg-white hover:text-breu"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">
            Setup
          </h1>
          <p className="font-data mt-0.5 text-[11px] uppercase tracking-wider text-aco/60">
            Inicializar Squad OS no banco de dados
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="rounded-3xl border border-breu/[0.08] bg-white p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-iris/10">
            <Database className="h-8 w-8 text-iris" />
          </div>

          <h2 className="font-display mt-4 text-xl font-bold text-breu">
            Inicializar Equipe AI
          </h2>
          <p className="mt-2 max-w-sm text-sm text-aco/70">
            Cria as squads, agents, missions e decisões iniciais no banco de dados.
            Só precisa rodar uma vez.
          </p>

          {/* Status */}
          {status === "idle" && (
            <button
              onClick={runSeed}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-iris px-6 py-3 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
            >
              <Rocket className="h-4 w-4" />
              Inicializar agora
            </button>
          )}

          {status === "loading" && (
            <div className="mt-6 flex items-center gap-2 text-sm text-aco/70">
              <Loader2 className="h-4 w-4 animate-spin text-iris" />
              Criando squads, agents e missions...
            </div>
          )}

          {status === "success" && result && (
            <div className="mt-6 w-full space-y-4">
              <div className="flex items-center justify-center gap-2 text-sucesso">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">{result.message}</span>
              </div>

              {result.agents !== undefined && (
                <div className="rounded-xl bg-bruma/60 px-5 py-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Agents" value={result.agents} />
                    <Stat label="Squads" value={result.squads} />
                    <Stat label="Missions" value={result.missions} />
                    <Stat label="Decisions" value={result.decisions} />
                  </div>
                </div>
              )}

              {result.count !== undefined && (
                <p className="text-xs text-aco/55">
                  Banco já tinha {result.count} squads — nenhum dado duplicado.
                </p>
              )}

              <Link
                href="/painel/squad-os"
                className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white transition hover:bg-iris-claro"
              >
                Ir para Equipe AI →
              </Link>
            </div>
          )}

          {status === "error" && result && (
            <div className="mt-6 w-full space-y-4">
              <div className="flex items-center justify-center gap-2 text-alerta">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm font-medium">Falha na inicialização</span>
              </div>
              <div className="rounded-xl bg-alerta/[0.05] border border-alerta/20 px-4 py-3">
                <p className="font-data text-xs text-alerta/80 break-all">
                  {result.error ?? result.message}
                </p>
              </div>
              <button
                onClick={runSeed}
                className="inline-flex items-center gap-2 rounded-xl bg-white border border-breu/10 px-5 py-2.5 text-sm font-medium text-breu transition hover:border-iris/30"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="rounded-2xl border border-breu/[0.06] bg-white px-5 py-4">
        <h3 className="font-data text-[10px] uppercase tracking-wider text-aco/40">
          O que será criado
        </h3>
        <ul className="mt-3 space-y-2 text-xs text-aco/70">
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-iris" />
            8 agents: Luna, Atlas, Pixel, Forge, Muse, Prism, Shield, Ops
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-iris" />
            8 squads: Product, Growth, Frontend, Backend, Brand, Data, QA, Operations
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-iris" />
            5 missions iniciais com status variados
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-iris" />
            3 decisões arquiteturais registradas
          </li>
        </ul>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="text-center">
      <p className="font-display text-lg font-bold text-breu">{value ?? 0}</p>
      <p className="font-data text-[9px] uppercase tracking-wider text-aco/50">{label}</p>
    </div>
  );
}
