"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, ExternalLink, Gauge, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authenticatedFetch } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { BRAND } from "@/lib/brand";

type Plan = {
  id: string;
  code: string;
  name: string;
  limits: Record<string, number | boolean | null>;
  stripe_price_id: string | null;
};

type Subscription = {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plans?: Plan | null;
} | null;

const planCopy: Record<string, string> = {
  FREE: "Validacao inicial com uma instancia e limites baixos.",
  ESSENCIAL: "Operacao enxuta para rodar WhatsApp com controle.",
  GROWTH: "Campanhas, mais capacidade e crescimento previsivel.",
  PERFORMANCE_MAX: "Limites altos para operacao madura e recorrente.",
};

function formatLimit(value: number | boolean | null | undefined, suffix = "") {
  if (value === true) return "Incluido";
  if (value === false || value == null) return "Nao incluido";
  if (value < 0) return "Ilimitado";
  return `${value.toLocaleString("pt-BR")}${suffix}`;
}

function periodLabel(date: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(date));
}

export function BillingPanel() {
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const currentPlanCode = subscription?.plans?.code ?? "FREE";
  const renewalDate = periodLabel(subscription?.current_period_end ?? null);

  const sortedPlans = useMemo(() => plans.filter((plan) => plan.code !== "FREE"), [plans]);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subscriptionRes] = await Promise.all([
        authenticatedFetch("/api/plans"),
        authenticatedFetch("/api/subscription"),
      ]);

      if (plansRes.ok) setPlans(await plansRes.json());
      if (subscriptionRes.ok) setSubscription(await subscriptionRes.json());
    } catch {
      toast("Nao foi possivel carregar billing", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  async function openCheckout(planCode: string) {
    setBusyPlan(planCode);
    try {
      const res = await authenticatedFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout indisponivel.");
      window.location.href = data.url;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao abrir checkout", "error");
    } finally {
      setBusyPlan(null);
    }
  }

  async function openPortal() {
    setPortalBusy(true);
    try {
      const res = await authenticatedFetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Portal indisponivel.");
      window.location.href = data.url;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao abrir portal", "error");
    } finally {
      setPortalBusy(false);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-cobalt-700" />
          Plano e assinatura
        </CardTitle>
        <Button variant="outline" size="sm" onClick={openPortal} disabled={portalBusy || loading}>
          {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Portal
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-aco">
          <span>Plano atual:</span>
          <Badge tone={currentPlanCode === "FREE" ? "slate" : "brand"}>{subscription?.plans?.name ?? "Free"}</Badge>
          {subscription?.status && <Badge tone="green">{subscription.status}</Badge>}
          {renewalDate && <span className="text-aco/50">Renova em {renewalDate}</span>}
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-44 rounded-lg border border-breu/10 bg-bruma" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {sortedPlans.map((plan) => {
              const current = plan.code === currentPlanCode;
              const limits = plan.limits ?? {};

              return (
                <div key={plan.id} className="rounded-lg border border-breu/10 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-breu">{plan.name}</p>
                      <p className="mt-1 text-xs leading-5 text-aco/70">{planCopy[plan.code] ?? `Plano pago ${BRAND.name}.`}</p>
                    </div>
                    {current && <Badge tone="green">Atual</Badge>}
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-aco">
                    <p className="flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-aco/50" />
                      {formatLimit(limits.instances, " instancia(s)")}
                    </p>
                    <p>Contatos: {formatLimit(limits.contacts)}</p>
                    <p>Campanhas: {formatLimit(limits.campaigns)}</p>
                    <p>Storage: {formatLimit(limits.storage_mb, " MB")}</p>
                  </div>

                  <Button
                    className="mt-4 w-full"
                    variant={current ? "outline" : "primary"}
                    onClick={() => openCheckout(plan.code)}
                    disabled={current || busyPlan === plan.code || !plan.stripe_price_id}
                  >
                    {busyPlan === plan.code ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {current ? "Plano atual" : "Assinar"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
