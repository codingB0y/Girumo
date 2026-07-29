import { TrendingUp, Users, Zap, CreditCard, Send, UserPlus, Radio, AlertTriangle, Target, Check } from "lucide-react";
import { AdminStatCard } from "@/components/admin/stat-card";
import {
  getFunnelMetrics,
  getTenantFunnelMatrix,
  summarizeTenantFunnel,
  ACTIVATION_MILESTONES,
  type FunnelEvent,
} from "@/lib/analytics/funnel-events";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

// Dias entre a criação da conta e o marco (tempo-até-marco). null se não atingiu.
function daysToMilestone(createdAt: string, occurredAt?: string): number | null {
  if (!occurredAt) return null;
  return Math.max(0, Math.floor((Date.parse(occurredAt) - Date.parse(createdAt)) / DAY_MS));
}

const FUNNEL_STEPS: { event: FunnelEvent; label: string; icon: typeof Users; color: string }[] = [
  { event: "signup", label: "Signup", icon: UserPlus, color: "text-blue-600 bg-blue-50" },
  { event: "qr_connected", label: "QR Conectado", icon: Radio, color: "text-emerald-600 bg-emerald-50" },
  { event: "first_group_synced", label: "Grupo Sincronizado", icon: Users, color: "text-purple-600 bg-purple-50" },
  { event: "first_dispatch", label: "1º Disparo", icon: Send, color: "text-amber-600 bg-amber-50" },
  { event: "first_campaign_created", label: "1ª Campanha", icon: Zap, color: "text-indigo-600 bg-indigo-50" },
  { event: "first_lead_captured", label: "1º Lead", icon: TrendingUp, color: "text-teal-600 bg-teal-50" },
  { event: "payment_completed", label: "Pagamento", icon: CreditCard, color: "text-green-600 bg-green-50" },
];

export default async function AdminFunilPage() {
  const [metrics, matrix] = await Promise.all([getFunnelMetrics(), getTenantFunnelMatrix()]);
  const now = Date.now();
  const tenants = matrix
    .map((row) => summarizeTenantFunnel(row, now))
    .sort((a, b) => {
      if (a.isStuck !== b.isStuck) return a.isStuck ? -1 : 1; // parados primeiro (acionáveis)
      if (a.reachedCount !== b.reachedCount) return a.reachedCount - b.reachedCount; // menos progresso primeiro
      return b.ageDays - a.ageDays;
    });
  const stuckCount = tenants.filter((t) => t.isStuck).length;

  const signupCount = metrics.signup ?? 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Funil de Conversão</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          Quantos tenants atingiram cada etapa do funil
        </p>
      </div>

      {/* KPIs summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AdminStatCard label="Signups" value={signupCount} icon={UserPlus} tone="blue" />
        <AdminStatCard label="Conectaram QR" value={metrics.qr_connected ?? 0} icon={Radio} tone="green" />
        <AdminStatCard label="1º Disparo" value={metrics.first_dispatch ?? 0} icon={Send} tone="amber" />
        <AdminStatCard label="Pagaram" value={metrics.payment_completed ?? 0} icon={CreditCard} tone="purple" />
      </div>

      {/* Funnel visualization */}
      <div className="rounded-2xl border border-volt-950/[0.06] bg-white p-6 shadow-sm">
        <h2 className="font-display mb-6 text-base font-bold">Funil por etapa</h2>
        <div className="space-y-3">
          {FUNNEL_STEPS.map((step, i) => {
            const count = metrics[step.event] ?? 0;
            const pct = signupCount > 0 ? Math.round((count / signupCount) * 100) : 0;
            const prevCount = i === 0 ? count : (metrics[FUNNEL_STEPS[i - 1].event] ?? 0);
            const dropoff = prevCount > 0 ? Math.round(((prevCount - count) / prevCount) * 100) : 0;

            return (
              <div key={step.event} className="group">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${step.color}`}>
                      <step.icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-volt-950">{step.label}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {i > 0 && dropoff > 0 && (
                      <span className="font-data text-[11px] text-red-500">-{dropoff}% drop</span>
                    )}
                    <span className="font-data text-sm font-semibold text-volt-950">{count}</span>
                    <span className="font-data w-12 text-right text-xs text-aco/50">{pct}%</span>
                  </div>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-canvas-100">
                  <div
                    className="h-full rounded-full bg-cobalt-500 transition-all duration-500"
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversion rates table */}
      <div className="rounded-2xl border border-volt-950/[0.06] bg-white p-6 shadow-sm">
        <h2 className="font-display mb-4 text-base font-bold">Taxas de Conversão</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-canvas-100">
                <th className="pb-2 text-left font-medium text-aco/70">De</th>
                <th className="pb-2 text-left font-medium text-aco/70">Para</th>
                <th className="pb-2 text-right font-medium text-aco/70">Taxa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas-100/50">
              {FUNNEL_STEPS.slice(1).map((step, i) => {
                const from = metrics[FUNNEL_STEPS[i].event] ?? 0;
                const to = metrics[step.event] ?? 0;
                const rate = from > 0 ? Math.round((to / from) * 100) : 0;
                return (
                  <tr key={step.event}>
                    <td className="py-2.5 text-aco">{FUNNEL_STEPS[i].label}</td>
                    <td className="py-2.5 text-aco">{step.label}</td>
                    <td className="py-2.5 text-right">
                      <span
                        className={`font-data rounded-full px-2 py-0.5 text-xs font-medium ${
                          rate >= 50
                            ? "bg-emerald-50 text-emerald-700"
                            : rate >= 25
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {rate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-tenant activation matrix — tempo até cada marco, parados em destaque */}
      <div className="rounded-2xl border border-volt-950/[0.06] bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold">Ativação por tenant</h2>
            <p className="font-data mt-0.5 text-[11px] uppercase tracking-wider text-aco/55">
              Tempo até cada marco · parados &gt;5 dias sem avançar em destaque
            </p>
          </div>
          {stuckCount > 0 && (
            <span className="font-data inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {stuckCount} parado{stuckCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-canvas-100 text-left">
                <th className="pb-2 pr-4 font-medium text-aco/70">Tenant</th>
                <th className="px-2 pb-2 text-right font-medium text-aco/70">Idade</th>
                {ACTIVATION_MILESTONES.map((m) => (
                  <th key={m.event} className="px-2 pb-2 text-center font-medium text-aco/70">
                    {m.label}
                  </th>
                ))}
                <th className="px-2 pb-2 text-center font-medium text-aco/70">Meta</th>
                <th className="pl-2 pb-2 text-right font-medium text-aco/70">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas-100/50">
              {tenants.map((t) => (
                <tr key={t.tenantId} className={t.isStuck ? "bg-red-50/40" : undefined}>
                  <td className="max-w-[220px] truncate py-2.5 pr-4 font-medium text-volt-950">{t.name}</td>
                  <td className="font-data px-2 py-2.5 text-right text-aco/70">{t.ageDays}d</td>
                  {ACTIVATION_MILESTONES.map((m) => {
                    const d = daysToMilestone(t.createdAt, t.milestones[m.event]);
                    return (
                      <td key={m.event} className="px-2 py-2.5 text-center">
                        {d === null ? (
                          <span className="text-aco/25">—</span>
                        ) : (
                          <span
                            className="font-data inline-flex items-center gap-0.5 text-emerald-600"
                            title={`atingido ${d} dia(s) após o cadastro`}
                          >
                            <Check className="h-3 w-3" />d{d}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2.5 text-center">
                    {t.goalSet ? (
                      <Target className="mx-auto h-4 w-4 text-cobalt-500" />
                    ) : (
                      <span className="text-aco/25">—</span>
                    )}
                  </td>
                  <td className="pl-2 py-2.5 text-right">
                    {t.activated ? (
                      <span className="font-data rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        ativado
                      </span>
                    ) : t.isStuck ? (
                      <span className="font-data rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        parado {t.daysSinceProgress}d
                      </span>
                    ) : (
                      <span className="font-data text-xs text-aco/55">{t.furthestLabel}</span>
                    )}
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={ACTIVATION_MILESTONES.length + 4} className="py-6 text-center text-aco/50">
                    Nenhum tenant ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
