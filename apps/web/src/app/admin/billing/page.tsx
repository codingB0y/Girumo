import { CreditCard, TrendingUp, AlertTriangle, CheckCircle2, Receipt, DollarSign } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminStatCard } from "@/components/admin/stat-card";
import { getStripe } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

async function getStripeMetrics() {
  try {
    const stripe = getStripe();

    // Últimas 20 invoices pagas
    const invoices = await stripe.invoices.list({
      status: "paid",
      limit: 20,
    });

    // Balanço (últimos 30 dias)
    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const recentCharges = await stripe.charges.list({
      created: { gte: thirtyDaysAgo },
      limit: 100,
    });

    const revenue30d = recentCharges.data
      .filter((c) => c.paid && !c.refunded)
      .reduce((acc, c) => acc + c.amount, 0);

    return {
      available: true,
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        customerEmail: inv.customer_email,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        created: inv.created,
        hostedUrl: inv.hosted_invoice_url,
      })),
      revenue30d,
      totalInvoices: invoices.data.length,
    };
  } catch (err) {
    return {
      available: false,
      invoices: [],
      revenue30d: 0,
      totalInvoices: 0,
      error: err instanceof Error ? err.message : "Stripe unavailable",
    };
  }
}

export default async function AdminBillingPage() {
  const supabase = getSupabaseAdmin();

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, tenant_id, status, plan_id, created_at, stripe_subscription_id")
    .order("created_at", { ascending: false });

  const { data: plans } = await supabase.from("plans").select("id, code, name, price_cents");

  const planMap = new Map<string, { code: string; name: string; price_cents: number }>();
  for (const p of plans ?? []) {
    planMap.set(p.id, { code: p.code, name: p.name, price_cents: p.price_cents });
  }

  // Buscar nomes dos tenants
  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const orgMap = new Map<string, string>();
  for (const o of orgs ?? []) {
    orgMap.set(o.id, o.name);
  }

  const allSubs = subs ?? [];
  const active = allSubs.filter((s) => s.status === "active" || s.status === "trialing");
  const free = allSubs.filter((s) => s.status === "free");
  const pastDue = allSubs.filter((s) => s.status === "past_due");
  const canceled = allSubs.filter((s) => s.status === "canceled");

  // MRR estimado (soma dos planos ativos)
  const mrr = active.reduce((acc, s) => {
    const plan = planMap.get(s.plan_id);
    return acc + (plan?.price_cents ?? 0);
  }, 0);

  // Dados Stripe reais
  const stripeData = await getStripeMetrics();

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Billing</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
            Visão financeira da plataforma
          </p>
        </div>
        <a
          href="https://dashboard.stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-volt-950/[0.06] bg-white px-4 py-2.5 text-sm font-medium text-volt-950 shadow-sm transition hover:border-cobalt-500/20 hover:shadow-md"
        >
          Stripe Dashboard &rarr;
        </a>
      </div>

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <AdminStatCard
          label="MRR estimado"
          value={`R$ ${(mrr / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          tone="green"
        />
        {stripeData.available && (
          <AdminStatCard
            label="Receita 30d (Stripe)"
            value={`R$ ${(stripeData.revenue30d / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={DollarSign}
            tone="green"
          />
        )}
        <AdminStatCard label="Ativas" value={active.length} icon={CheckCircle2} tone="green" />
        <AdminStatCard label="Free" value={free.length} icon={CreditCard} tone="slate" />
        <AdminStatCard label="Inadimplentes" value={pastDue.length} icon={AlertTriangle} tone="amber" />
        <AdminStatCard label="Canceladas" value={canceled.length} icon={CreditCard} tone="red" />
      </div>

      {/* Stripe connection status */}
      {!stripeData.available && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">Stripe não conectado</p>
              <p className="mt-0.5 text-xs text-amber-600/70">
                {(stripeData as { error?: string }).error ?? "Verifique STRIPE_SECRET_KEY"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Invoices recentes do Stripe */}
      {stripeData.available && stripeData.invoices.length > 0 && (
        <div className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-volt-950/[0.06] px-5 py-4">
            <Receipt className="h-4 w-4 text-cobalt-500" />
            <h2 className="font-display text-base font-bold">Invoices Recentes (Stripe)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-volt-950/[0.06]">
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Invoice</th>
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Cliente</th>
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Valor</th>
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Status</th>
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Data</th>
                  <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-volt-950/[0.04]">
                {stripeData.invoices.map((inv) => (
                  <tr key={inv.id} className="transition hover:bg-canvas-100/30">
                    <td className="px-5 py-3.5 font-data text-xs text-volt-950">
                      {inv.number ?? inv.id.slice(-8)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-aco/60">
                      {inv.customerEmail ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs font-medium text-volt-950">
                      R$ {(inv.amountPaid / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 font-data text-[10px] uppercase tracking-wider text-emerald-700">
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-aco/50">
                      {new Date(inv.created * 1000).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-5 py-3.5">
                      {inv.hostedUrl ? (
                        <a
                          href={inv.hostedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-data text-xs text-cobalt-500 hover:underline"
                        >
                          Ver
                        </a>
                      ) : (
                        <span className="text-xs text-aco/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabela de assinaturas internas */}
      <div className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
        <div className="border-b border-volt-950/[0.06] px-5 py-4">
          <h2 className="font-display text-base font-bold">Assinaturas (Database)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-volt-950/[0.06]">
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Tenant</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Plano</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Preço</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Status</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Stripe ID</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Criado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-volt-950/[0.04]">
              {allSubs.map((s) => {
                const plan = planMap.get(s.plan_id);
                return (
                  <tr key={s.id} className="transition hover:bg-canvas-100/30">
                    <td className="px-5 py-3.5 font-medium text-volt-950">
                      {orgMap.get(s.tenant_id) ?? s.tenant_id}
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-aco/60">
                      {plan?.name ?? plan?.code ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-volt-950">
                      {plan?.price_cents
                        ? `R$ ${(plan.price_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 py-3.5 font-data text-[11px] text-aco/40">
                      {s.stripe_subscription_id
                        ? s.stripe_subscription_id.slice(-12)
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 font-data text-xs text-aco/50">
                      {new Date(s.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {allSubs.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <CreditCard className="h-8 w-8 text-aco/30" />
            <p className="text-sm text-aco/50">Nenhuma assinatura encontrada.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    trialing: "bg-blue-50 text-blue-700",
    free: "bg-slate-100 text-slate-600",
    canceled: "bg-red-50 text-red-600",
    past_due: "bg-amber-50 text-amber-700",
  };
  const labels: Record<string, string> = {
    active: "Ativo",
    trialing: "Trial",
    free: "Free",
    canceled: "Cancelado",
    past_due: "Inadimplente",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${styles[status] ?? "bg-slate-100 text-slate-500"}`}>
      {labels[status] ?? status}
    </span>
  );
}
