"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, LockKeyhole, QrCode, Sparkles, Smartphone } from "lucide-react";
import { useState } from "react";
import { DemoDashboard } from "@/components/demo/demo-dashboard";
import { demoScenario } from "@/lib/demo-data";

type DemoStage = "intro" | "connecting" | "dashboard";

export function DemoExperience() {
  const [stage, setStage] = useState<DemoStage>("intro");
  const [notice, setNotice] = useState<string | null>(null);

  if (stage === "dashboard") {
    return <DemoDashboard scenario={demoScenario} notice={notice} onSimulatedAction={setNotice} />;
  }

  const connecting = stage === "connecting";

  return (
    <main className="min-h-screen bg-paper-0 px-4 py-6 text-volt-950 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="font-display text-xl font-extrabold tracking-[-0.04em] text-volt-950">
            girumo
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cobalt-500/10 px-3 py-1.5 font-data text-[10px] font-medium uppercase tracking-[0.14em] text-cobalt-700">
            <Sparkles className="h-3.5 w-3.5" /> Modo demonstração
          </span>
        </header>

        <section className="mt-12 grid items-center gap-8 lg:grid-cols-[1fr_0.9fr] lg:gap-14">
          <div>
            <p className="font-data text-[11px] font-medium uppercase tracking-[0.16em] text-cobalt-600">Conheça por dentro</p>
            <h1 className="font-display mt-4 max-w-xl text-4xl font-extrabold leading-[0.97] tracking-[-0.055em] text-volt-950 sm:text-6xl">
              Veja sua operação crescer antes mesmo de conectar.
            </h1>
            <p className="font-editorial mt-6 max-w-lg text-xl leading-relaxed italic text-ardosia sm:text-2xl">
              Experimente a Girumo com uma loja fictícia. Nada é conectado, enviado ou salvo de verdade.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-sm text-aco/80">
              <span className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2"><CheckCircle2 className="h-4 w-4 text-sucesso" /> Dados fictícios</span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2"><LockKeyhole className="h-4 w-4 text-cobalt-500" /> Sem acesso ao seu WhatsApp</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] bg-volt-950 p-5 shadow-[0_30px_70px_rgba(7,25,35,0.22)] sm:p-8">
            <div className="rounded-2xl border border-paper-0/10 bg-paper-0/[0.04] p-5 sm:p-7">
              {connecting ? <SimulatedConnection onConnect={() => setStage("dashboard")} /> : <DemoStart onStart={() => setStage("connecting")} />}
            </div>
          </div>
        </section>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-volt-950/10 pt-6 text-sm text-aco/65">
          <span>Uma simulação segura para entender como a Girumo funciona.</span>
          <Link href="/signup" className="inline-flex items-center gap-2 font-medium text-cobalt-600 transition hover:text-cobalt-800">
            Criar minha conta <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}

function DemoStart({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-[340px] flex-col justify-between text-paper-0">
      <div>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cobalt-500/20 text-cobalt-300">
          <Smartphone className="h-6 w-6" />
        </span>
        <p className="font-data mt-7 text-[11px] uppercase tracking-[0.16em] text-paper-0/50">Passo 1 de 3</p>
        <h2 className="font-display mt-3 text-3xl font-bold tracking-[-0.04em]">Simule uma conexão</h2>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-paper-0/65">
          Vamos usar um QR ilustrativo e um número fictício só para mostrar o que acontece depois que o WhatsApp entra.
        </p>
      </div>
      <button type="button" onClick={onStart} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acid-500 px-5 py-3.5 text-sm font-semibold text-volt-950 transition hover:brightness-95">
        Iniciar demonstração <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function SimulatedConnection({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-between text-center text-paper-0">
      <div>
        <p className="font-data text-[11px] uppercase tracking-[0.16em] text-paper-0/50">Conexão simulada</p>
        <h2 className="font-display mt-2 text-2xl font-bold tracking-[-0.04em]">Como se fosse no seu celular</h2>
        <div className="mx-auto mt-5 flex h-36 w-36 items-center justify-center rounded-2xl bg-paper-0 p-3">
          <div className="grid h-full w-full grid-cols-7 gap-1" aria-hidden="true">
            {Array.from({ length: 49 }, (_, index) => (
              <span key={index} className={(index * 7 + index * 3) % 5 < 2 || index < 7 || index % 7 === 0 ? "bg-volt-950" : "bg-paper-0"} />
            ))}
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-paper-0/65">Este QR não funciona e não lê nada do seu aparelho.</p>
      </div>
      <button type="button" onClick={onConnect} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acid-500 px-5 py-3.5 text-sm font-semibold text-volt-950 transition hover:brightness-95">
        <QrCode className="h-4 w-4" /> Simular conexão concluída
      </button>
    </div>
  );
}
