import { TrendingUp, Users, Zap, CreditCard, Send, UserPlus, Radio } from "lucide-react";
import { AdminStatCard } from "@/components/admin/stat-card";
import { getFunnelMetrics, type FunnelEvent } from "@/lib/analytics/funnel-events";

export const dynamic = "force-dynamic";

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
  const metrics = await getFunnelMetrics();

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
    </div>
  );
}
