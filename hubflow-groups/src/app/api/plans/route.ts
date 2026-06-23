import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/plans — catálogo de planos ativos (do seed), p/ a tela de escolha.
export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { priceCents: "asc" },
    select: { id: true, code: true, name: true, priceCents: true, interval: true },
  });
  return Response.json(plans);
}
