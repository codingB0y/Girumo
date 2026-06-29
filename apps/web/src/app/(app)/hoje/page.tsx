import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Filter,
  HeartPulse,
  ListChecks,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import { DailyChecklist, type ChecklistItem } from "@/components/daily-checklist";
import { FunnelVisual } from "@/components/funnel-visual";
import { HealthCard } from "@/components/health-card";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getResultsOverview } from "@/lib/business-health";
import { maskPhone } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SCORE_TONE = {
  verde: { dot: "bg-emerald-500", text: "text-emerald-700", bar: "bg-emerald-500", label: "Saudavel" },
  amarelo: { dot: "bg-amber-500", text: "text-amber-700", bar: "bg-amber-500", label: "Atencao" },
  vermelho: { dot: "bg-red-500", text: "text-red-700", bar: "bg-red-500", label: "Critico" },
} as const;

const ACTION_TONE = {
  green: "border-emerald-200 bg-emerald-50",
  amber: "border-amber-200 bg-amber-50",
  red: "border-red-200 bg-red-50",
} as const;

export default async function HojePage() {
  const r = await getResultsOverview();
  const tone = SCORE_TONE[r.score.status];

  const checklist: ChecklistItem[] = [
    { id: "saude", label: "Conferir a saude do numero", hint: "Veja o card de saude do numero." },
    ...(r.pedidos === 0
      ? [{ id: "pedido", label: "Registrar um pedido", hint: "Marque uma revendedora como compradora." }]
      : []),
    { id: "drop", label: "Postar uma novidade nos grupos", hint: "Use um modelo de mensagem pronto." },
    ...(r.gruposParados > 0
      ? [{ id: "frios", label: "Reativar grupos parados", hint: `${r.gruposParados} sem entrada ha dias` }]
      : []),
  ];

  const entradasVar =
    r.entradasPrev > 0 ? Math.round((r.entradasSemana / r.entradasPrev - 1) * 100) : null;

  const statusText =
    r.score.status === "verde"
      ? "Operacao em crescimento"
      : r.score.status === "amarelo"
        ? "Operacao pede atencao"
        : "Operacao em queda";

  return (
    <>
      <Topbar title="Hoje" subtitle="Operacao, crescimento e acoes do dia" />
      <main className="flex-1 bg-bruma/70 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5">
          <OnboardingChecklist />

          <section className="rounded-lg border border-breu/10 bg-white shadow-card">
            <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
              <div className="border-b border-breu/10 p-4 lg:border-b-0 lg:border-r">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                      <p className="text-sm font-medium text-aco">{statusText}</p>
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold tracking-normal text-breu">O que fazer agora</h1>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-aco/70">
                      Veja a proxima acao para manter seus grupos recebendo clientes.
                    </p>
                  </div>
                  <Link
                    href={r.nextAction.href}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-iris px-4 text-sm font-semibold text-white shadow-brand transition hover:bg-iris-escuro"
                  >
                    {r.nextAction.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <MetricTile icon={UserPlus} label="Entradas hoje" value={`+${r.entradasHoje}`} />
                  <MetricTile icon={UserPlus} label="Entradas em 7 dias" value={`+${r.entradasSemana}`} />
                  <MetricTile icon={HeartPulse} label="Grupos parados" value={r.gruposParados} />
                </div>
              </div>

              <div className="p-4">
                <div className={`rounded-lg border p-4 ${ACTION_TONE[r.nextAction.tone]}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-aco/70">Proxima acao</p>
                  <p className="mt-2 text-base font-semibold leading-6 text-breu">{r.nextAction.text}</p>
                  <Link
                    href={r.nextAction.href}
                    className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-breu px-4 text-sm font-semibold text-white transition hover:bg-breu"
                  >
                    {r.nextAction.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {r.recompra.sumidas > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-amber-600" />
                  Revendedoras para reativar
                  <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    {r.recompra.sumidas}
                  </span>
                </CardTitle>
                <Link
                  href="/campanhas"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-white transition hover:bg-amber-600"
                >
                  Ver campanhas
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-aco">
                  Pessoas que ja compraram costumam custar menos para converter de novo.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {r.recompra.list.map((item) => (
                    <div
                      key={item.phone}
                      className="flex items-center justify-between rounded-lg border border-amber-100 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-breu">
                          {item.phone ? maskPhone(item.phone) : "Numero oculto"}
                        </p>
                        {item.group && <p className="truncate text-xs text-aco/50">{item.group}</p>}
                      </div>
                      <span className="ml-2 shrink-0 text-xs font-medium text-amber-700">ha {item.dias}d</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-aco/50" />
                Caminho ate a venda
              </CardTitle>
              <p className="text-sm text-aco/70">
                Onde o fluxo perde resultado.
                {r.atividade.medida && (
                  <span className="ml-1 text-aco/50">
                    {r.atividade.mensagensHoje} mensagens hoje em {r.atividade.gruposAtivos} grupo(s)
                  </span>
                )}
              </p>
            </CardHeader>
            <CardContent>
              <FunnelVisual funnel={r.funnel} insight={r.funnelInsight} entradasVar={entradasVar} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-aco/50" />
                  Saude do negocio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <span className={`text-4xl font-semibold ${tone.text}`}>{r.score.value}</span>
                  <span className="pb-1 text-sm text-aco/50">/ 100</span>
                </div>
                <p className={`mt-1 text-sm font-medium ${tone.text}`}>{r.score.label}</p>
                <p className="mt-2 text-xs leading-5 text-aco/70">{r.score.reason}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-bruma">
                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${r.score.value}%` }} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <HealthCard />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-aco/50" />
                  Rotina de hoje
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DailyChecklist items={checklist} />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-breu/10 bg-bruma px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-aco/70">{label}</p>
        <Icon className="h-4 w-4 text-aco/50" />
      </div>
      <p className="mt-2 text-xl font-semibold text-breu">{value}</p>
    </div>
  );
}
