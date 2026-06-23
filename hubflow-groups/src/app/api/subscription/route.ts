import { prisma } from "@/lib/db";
import { getSessionAccountId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/subscription — assinatura ativa da conta logada (com o plano), ou null.
export async function GET() {
  const accountId = await getSessionAccountId();
  if (!accountId) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const sub = await prisma.subscription.findFirst({
    where: { accountId, status: { not: "CANCELED" } },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
  return Response.json(sub);
}

// POST /api/subscription — assina/troca de plano. Body { planId }.
// Fase híbrida (manual): cria/atualiza a assinatura e gera a 1ª fatura OPEN (vencimento hoje).
// A cobrança automática (Asaas) entra na Fatia 4.
export async function POST(req: Request) {
  const accountId = await getSessionAccountId();
  if (!accountId) return Response.json({ error: "Não autenticado." }, { status: 401 });

  let b: { planId?: string };
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const planId = String(b.planId ?? "");
  const plan = planId ? await prisma.plan.findUnique({ where: { id: planId } }) : null;
  if (!plan || !plan.active) return Response.json({ error: "Plano inválido." }, { status: 400 });

  const now = new Date();
  const periodEnd = new Date(now);
  if (plan.interval === "YEARLY") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findFirst({
      where: { accountId, status: { not: "CANCELED" } },
    });
    const sub = existing
      ? await tx.subscription.update({
          where: { id: existing.id },
          data: { planId: plan.id, status: "ACTIVE", currentPeriodEnd: periodEnd },
          include: { plan: true },
        })
      : await tx.subscription.create({
          data: { accountId, planId: plan.id, currentPeriodEnd: periodEnd },
          include: { plan: true },
        });
    // Gera a 1ª fatura do ciclo (manual) só se não houver uma OPEN pendente.
    const open = await tx.invoice.findFirst({ where: { subscriptionId: sub.id, status: "OPEN" } });
    const invoice =
      open ??
      (await tx.invoice.create({
        data: { accountId, subscriptionId: sub.id, amountCents: plan.priceCents, dueDate: now, status: "OPEN" },
      }));
    return { subscription: sub, invoice };
  });

  return Response.json(result, { status: 201 });
}
