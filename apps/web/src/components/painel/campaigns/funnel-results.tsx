"use client";

import { useEffect, useState } from "react";
import { Workflow, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FunnelResult, FunnelResultStep } from "@/lib/funnels/results";

/** Quantos grupos receberam, no tom do que aconteceu. */
function EntregaChip({ step }: { step: FunnelResultStep }) {
  if (step.status !== "sent" && step.status !== "failed") {
    return (
      <span className="text-12 shrink-0 rounded-full bg-canvas-100 px-2.5 py-1 font-medium text-slate-600">
        {step.status === "scheduled" ? "Agendado" : "Não saiu"}
      </span>
    );
  }
  const tudo = step.total > 0 && step.sent === step.total;
  return (
    <span
      className={cn(
        "font-data text-12 shrink-0 rounded-full px-2.5 py-1",
        tudo ? "bg-sucesso/10 text-sucesso" : "bg-alerta/10 text-alerta",
      )}
    >
      {step.sent}/{step.total} grupos
    </span>
  );
}

function quando(at?: string): string {
  if (!at) return "—";
  return new Date(at).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "cobalt" | "sucesso" }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-canvas-100 px-4 py-3">
      <span className="font-data text-12 uppercase tracking-[0.08em] text-slate-600">{rotulo}</span>
      <span
        className={cn(
          "font-data text-xl tabular-nums",
          tom === "cobalt" && "text-cobalt-500",
          tom === "sucesso" && "text-sucesso",
        )}
      >
        {valor}
      </span>
    </div>
  );
}

function Funil({ funil }: { funil: FunnelResult }) {
  const oferta = funil.offer;
  return (
    <div className="pn-card flex flex-col gap-5 rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Workflow className="h-4 w-4 text-cobalt-500" strokeWidth={1.75} />
        <h3 className="font-display text-base font-bold text-volt-950">{funil.label}</h3>
        <span
          className={cn(
            "text-12 rounded-full px-2.5 py-1 font-medium",
            funil.enviadas === funil.steps.length ? "bg-sucesso/10 text-sucesso" : "bg-atencao/10 text-atencao",
          )}
        >
          {funil.enviadas} de {funil.steps.length} saíram
        </span>
        <span className="font-data text-12 text-slate-600">{quando(funil.steps[0]?.at)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Entregue" valor={`${funil.gruposEntregues}/${funil.gruposAlvo} grupos`} />
        <Numero rotulo="Pediram" valor={oferta ? String(oferta.pediram) : "—"} tom={oferta ? "cobalt" : undefined} />
        <Numero rotulo="Vagas tomadas" valor={oferta ? `${oferta.atendidas}/${oferta.slots}` : "—"} />
        <Numero rotulo="Vendeu" valor={oferta ? String(oferta.vendeu) : "—"} tom={oferta ? "sucesso" : undefined} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-data text-12 uppercase tracking-[0.08em] text-slate-600">
          {funil.steps.length === 1 ? "A mensagem" : `As ${funil.steps.length} mensagens`}
        </span>
        {funil.steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "flex flex-col gap-2 rounded-xl border p-3",
              step.offer ? "border-cobalt-500 bg-cobalt-soft" : "border-line-200",
            )}
          >
            <div className="flex items-start gap-3">
              <span className="font-data text-12 w-7 shrink-0 pt-0.5 text-slate-600">
                {step.index}/{funil.steps.length}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-volt-950">
                  {step.label}
                  {step.offer && (
                    <span className="text-12 inline-flex items-center gap-1 rounded-full bg-volt-950 px-2 py-0.5 font-medium text-acid-500">
                      <Zap className="h-3 w-3" /> Relâmpago
                    </span>
                  )}
                </span>
                {step.body && <span className="truncate text-13 text-slate-600">{step.body}</span>}
              </div>
              <span className="font-data text-12 shrink-0 text-slate-600">{quando(step.at)}</span>
              <EntregaChip step={step} />
            </div>
            {step.offer && (
              <div className="text-13 flex flex-wrap gap-x-5 gap-y-1 pl-10 text-slate-600">
                <span>
                  Pediram <strong className="font-data text-volt-950">{step.offer.pediram}</strong>
                </span>
                <span>
                  Atendidas <strong className="font-data text-volt-950">{step.offer.atendidas}</strong>
                </span>
                <span>
                  Venderam <strong className="font-data text-sucesso">{step.offer.vendeu}</strong>
                </span>
                <span>
                  Desistiram <strong className="font-data text-atencao">{step.offer.desistiram}</strong>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FunnelResults({ campaignSlug }: { campaignSlug: string }) {
  const [funis, setFunis] = useState<FunnelResult[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/campanhas/${encodeURIComponent(campaignSlug)}/funis`)
      .then((r) => (r.ok ? (r.json() as Promise<FunnelResult[]>) : Promise.reject(new Error(String(r.status)))))
      .then((lista) => vivo && setFunis(lista))
      // Lista vazia e falha são cenas diferentes: sem isto um erro viraria
      // "nenhum funil ainda", que é mentira.
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [campaignSlug]);

  if (erro) {
    return (
      <div className="pn-card rounded-xl p-6">
        <p className="text-sm text-slate-600">Não deu pra carregar os funis agora. Recarregue a página.</p>
      </div>
    );
  }

  if (funis === null) {
    return (
      <div className="pn-card rounded-xl p-6">
        <p className="text-sm text-slate-600">Carregando os funis…</p>
      </div>
    );
  }

  if (funis.length === 0) {
    return (
      <div className="pn-card flex flex-col items-start gap-3 rounded-xl p-6">
        <h3 className="font-display text-base font-bold text-volt-950">Nenhum funil confirmado ainda</h3>
        <p className="text-13 max-w-xl text-slate-600">
          Um funil é um roteiro pronto que agenda as mensagens de uma live, de um evento ou da grade do dia.
          Depois que o primeiro sair, os números de cada etapa aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-base font-bold text-volt-950">Resultados por funil</h2>
        <p className="text-13 text-slate-600">
          Cliques e entradas continuam sendo da campanha inteira: o link do funil é o mesmo da campanha, então
          não dá pra saber de qual mensagem veio cada clique. Um traço quer dizer que o roteiro não tem oferta
          relâmpago, logo não há pedido nem venda pra contar.
        </p>
      </div>
      {funis.map((funil) => (
        <Funil key={funil.runId} funil={funil} />
      ))}
    </div>
  );
}
