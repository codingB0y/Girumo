import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-guard";
import { blockInProduction, isDev } from "@/lib/environment";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dev-tools/simulate-webhook
 * Simula um webhook Stripe fake (invoice.paid, subscription.updated, etc.)
 * ⚠️  BLOQUEADO em produção.
 */
export async function POST() {
  const admin = await getAdminContext();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    blockInProduction("simulate-webhook");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }

  if (!isDev()) {
    return NextResponse.json({ error: "Apenas em development" }, { status: 403 });
  }

  // Simula diferentes tipos de webhook
  const webhookTypes = [
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "checkout.session.completed",
  ];

  const randomType = webhookTypes[Math.floor(Math.random() * webhookTypes.length)];

  const fakeWebhook = {
    id: `evt_dev_${Date.now()}`,
    type: randomType,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `sub_dev_${Math.random().toString(36).slice(2, 10)}`,
        customer: `cus_dev_${Math.random().toString(36).slice(2, 10)}`,
        status: randomType.includes("paid") ? "active" : "past_due",
        amount_paid: 9700,
        currency: "brl",
      },
    },
  };

  console.log(`[DEV-TOOLS] 🔔 Webhook simulado: ${randomType}`, fakeWebhook);

  return NextResponse.json({
    success: true,
    message: `Webhook simulado: ${randomType}`,
    webhook: fakeWebhook,
  });
}
