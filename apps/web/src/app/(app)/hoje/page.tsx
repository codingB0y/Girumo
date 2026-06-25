import Link from "next/link";
import {
  Activity,
  ArrowRight,
  DollarSign,
  Filter,
  HeartPulse,
  ListChecks,
  RotateCcw,
  ShoppingBag,
  Target,
  TrendingUp,
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
      <main className="flex-1 bg-slate-50/70 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5">
          <OnboardingChecklist />

          <section className="rounded-lg border border-slate-200 bg-white shadow-card">
            <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
              <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                      <p className="text-sm font-medium text-slate-600">{statusText}</p>
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">
                      Painel de controle do dia
                    </h1>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                      Acompanhe entradas, pedidos, faturamento e gargalos antes de disparar novas campanhas.
                    </p>
                  </div>
                  <Link
                    href="/acquisition"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-brand transition hover:bg-brand-700"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Atrair leads
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <MetricTile icon={UserPlus} label="Entradas hoje" value={`+${r.entradasHoje}`} />
                  <MetricTile icon={ShoppingBag} label="Pedidos na semana" value={r.pedidosSemana} />
                  <MetricTile
                    icon={DollarSign}
                    label="Faturamento semanal"
                    value={`R$ ${Math.round(r.faturamentoSemana).toLocaleString("pt-BR")}`}
                  />
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Meta da semana</p>
                    <p className="text-xs text-slate-500">
                      {r.meta.current} de {r.meta.goal} revendedoras
                    </p>
                  </div>
                  <span className="text-lg font-semibold text-slate-950">{r.meta.pct}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-600 transition-all duration-700" style={{ width: `${r.meta.pct}%` }} />
                </div>
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Score</p>
                  <div className="mt-2 flex items-end gap-2">
                    <span className={`text-4xl font-semibold ${tone.text}`}>{r.score.value}</span>
                    <span className="pb-1 text-sm text-slate-400">/ 100</span>
                  </div>
                  <p className={`mt-1 text-sm font-medium ${tone.text}`}>{tone.label}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{r.score.reason}</p>
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
                  href="/campaigns"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-white transition hover:bg-amber-600"
                >
                  Enviar oferta
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-slate-600">
                  Pessoas que ja compraram costumam custar menos para converter de novo.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {r.recompra.list.map((item) => (
                    <div
                      key={item.phone}
                      className="flex items-center justify-between rounded-lg border border-amber-100 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {item.phone ? maskPhone(item.phone) : "Numero oculto"}
                        </p>
                        {item.group && <p className="truncate text-xs text-slate-400">{item.group}</p>}
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
                <Filter className="h-4 w-4 text-slate-400" />
                Caminho ate a venda
              </CardTitle>
              <p className="text-sm text-slate-500">
                Onde o fluxo perde resultado.
                {r.atividade.medida && (
                  <span className="ml-1 text-slate-400">
                    {r.atividade.mensagensHoje} mensagens hoje em {r.atividade.gruposAtivos} grupo(s)
                  </span>
                )}
              </p>
            </CardHeader>
            <CardContent>
              <FunnelVisual funnel={r.funnel} insight={r.funnelInsight} entradasVar={entradasVar} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className={`border ${ACTION_TONE[r.nextAction.tone]} lg:col-span-2`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-slate-500" />
                  Proxima acao
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-base font-medium leading-6 text-slate-800">{r.nextAction.text}</p>
                <Link
                  href={r.nextAction.href}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {r.nextAction.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HeartPulse className="h-4 w-4 text-slate-400" />
                  Saude do negocio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <span className={`text-4xl font-semibold ${tone.text}`}>{r.score.value}</span>
                  <span className="pb-1 text-sm text-slate-400">/ 100</span>
                </div>
                <p className={`mt-1 text-sm font-medium ${tone.text}`}>{r.score.label}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{r.score.reason}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
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
                  <ListChecks className="h-4 w-4 text-slate-400" />
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
