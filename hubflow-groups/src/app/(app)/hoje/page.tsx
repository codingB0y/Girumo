import Link from "next/link";
import {
  Filter,
  ShoppingBag,
  UserPlus,
  ArrowRight,
  ListChecks,
  HeartPulse,
  Target,
  Rocket,
  DollarSign,
  RotateCcw,
} from "lucide-react";
import { maskPhone } from "@/lib/utils";
import { Topbar } from "@/components/topbar";
import { HealthCard } from "@/components/health-card";
import { FunnelVisual } from "@/components/funnel-visual";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { DailyChecklist, type ChecklistItem } from "@/components/daily-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getResultsOverview } from "@/lib/business-health";

export const dynamic = "force-dynamic";

const SCORE_TONE = {
  verde: { dot: "bg-green-500", text: "text-green-700", bg: "bg-green-50", bar: "bg-green-500", emoji: "🟢" },
  amarelo: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", bar: "bg-amber-500", emoji: "🟠" },
  vermelho: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", bar: "bg-red-500", emoji: "🔴" },
} as const;

const ACTION_TONE = {
  green: "border-green-200 bg-green-50",
  amber: "border-amber-200 bg-amber-50",
  red: "border-red-200 bg-red-50",
} as const;

export default async function HojePage() {
  const r = await getResultsOverview();
  const tone = SCORE_TONE[r.score.status];

  const hour = new Date().getHours();
  const saudacao = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  const checklist: ChecklistItem[] = [
    { id: "saude", label: "Conferir a saúde do número", hint: "Veja o card de saúde do número." },
    ...(r.pedidos === 0 ? [{ id: "pedido", label: "Registrar um pedido", hint: "Marque uma revendedora como compradora." }] : []),
    { id: "drop", label: "Postar uma novidade nos grupos", hint: "Use um modelo de mensagem pronto." },
    ...(r.gruposParados > 0 ? [{ id: "frios", label: "Reativar grupos parados", hint: `${r.gruposParados} sem entrada há dias` }] : []),
  ];

  // Variação da etapa "entradas" (única com histórico real semana vs semana).
  const entradasVar =
    r.entradasPrev > 0 ? Math.round((r.entradasSemana / r.entradasPrev - 1) * 100) : null;

  return (
    <>
      <Topbar title="Hoje" subtitle="Como está seu negócio agora" />
      <main className="flex-1 space-y-6 p-6">
        <OnboardingChecklist />

        {/* CARD PRINCIPAL (HERO) — responde "meu grupo está crescendo?" em 5s */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1b1533] via-[#241a48] to-[#3a2a7d] p-6 text-white shadow-card dz-rise">
          {/* glows */}
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-500/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-white/60">{saudacao}! Hoje, no seu negócio:</p>
              <p className="mt-1.5 flex items-center gap-2.5 text-2xl font-bold tracking-tight">
                <span className={`h-2.5 w-2.5 rounded-full ${tone.dot} ring-4 ring-white/10`} />
                {r.score.status === "verde"
                  ? "Seu negócio está crescendo"
                  : r.score.status === "amarelo"
                    ? "Seu negócio precisa de atenção"
                    : "Seu negócio parou — bora reagir"}
              </p>
              <Link
                href="/acquisition"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#241a48] shadow-lg transition hover:-translate-y-px hover:bg-white/95"
              >
                <Rocket className="h-4 w-4" />
                LOTAR MEU GRUPO
              </Link>
            </div>
            <div className="flex gap-3">
              <HeroStat icon={UserPlus} value={`+${r.entradasHoje}`} label="revendedoras hoje" />
              <HeroStat icon={ShoppingBag} value={r.pedidosSemana} label="pedidos na semana" />
              <HeroStat
                icon={DollarSign}
                value={`R$${Math.round(r.faturamentoSemana).toLocaleString("pt-BR")}`}
                label="vendido na semana"
              />
            </div>
          </div>

          {/* Meta semanal */}
          <div className="relative mt-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-white/80">Meta da semana</span>
              <span className="text-white/60">
                {r.meta.current} / {r.meta.goal} revendedoras · {r.meta.pct}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-400 to-emerald-400 transition-all duration-700"
                style={{ width: `${r.meta.pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* RECOMPRA — reativar quem já comprou (a venda mais barata) */}
        {r.recompra.sumidas > 0 && (
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-500" />
                Revendedoras pra reativar
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {r.recompra.sumidas}
                </span>
              </CardTitle>
              <Link
                href="/campaigns"
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-600"
              >
                Enviar oferta de volta
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-slate-500">
                Já compraram e sumiram. Reativar quem te conhece é mais barato que achar gente nova.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {r.recompra.list.map((item) => (
                  <div
                    key={item.phone}
                    className="flex items-center justify-between rounded-lg border border-amber-100 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {item.phone ? maskPhone(item.phone) : "Número oculto"}
                      </p>
                      {item.group && <p className="truncate text-xs text-slate-400">{item.group}</p>}
                    </div>
                    <span className="ml-2 shrink-0 text-xs font-medium text-amber-600">há {item.dias}d</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* FUNIL VISUAL — peça central: onde estou perdendo gente? */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              O caminho até a venda
            </CardTitle>
            <p className="text-sm text-slate-500">
              Em menos de 3 segundos: onde seu grupo perde resultado.
              {r.atividade.medida && (
                <span className="ml-1 text-slate-400">
                  · 💬 {r.atividade.mensagensHoje} mensagens hoje em {r.atividade.gruposAtivos} grupo(s)
                </span>
              )}
            </p>
          </CardHeader>
          <CardContent>
            <FunnelVisual funnel={r.funnel} insight={r.funnelInsight} entradasVar={entradasVar} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* PRÓXIMA AÇÃO — uma só, mata a paralisia */}
          <Card className={`border ${ACTION_TONE[r.nextAction.tone]} lg:col-span-2`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4 text-slate-400" />
                Sua próxima ação
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-md text-lg font-medium text-slate-800">{r.nextAction.text}</p>
              <Link
                href={r.nextAction.href}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {r.nextAction.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>

          {/* SAÚDE DO NEGÓCIO — score 0-100 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-slate-400" />
                Saúde do negócio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <span className={`text-4xl font-bold ${tone.text}`}>{r.score.value}</span>
                <span className="pb-1 text-sm text-slate-400">/ 100</span>
              </div>
              <p className={`mt-1 text-sm font-medium ${tone.text}`}>
                {tone.emoji} {r.score.label}
              </p>
              <p className="mt-2 text-xs text-slate-500">{r.score.reason}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${r.score.value}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* SAÚDE DO NÚMERO */}
          <HealthCard />

          {/* ROTINA DO DIA */}
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
      </main>
    </>
  );
}

function HeroStat({ icon: Icon, value, label }: { icon: typeof UserPlus; value: string | number; label: string }) {
  return (
    <div className="min-w-[5.5rem] rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-center backdrop-blur-sm">
      <Icon className="mx-auto mb-1 h-4 w-4 text-white/50" />
      <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="text-[11px] text-white/50">{label}</p>
    </div>
  );
}
