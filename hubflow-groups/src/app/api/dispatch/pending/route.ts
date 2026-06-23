import { claimPending } from "@/lib/dispatch-store";
import { processDueSchedules } from "@/lib/schedules-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/dispatch/pending — a ENGINE reivindica as ofertas enfileiradas.
// (POST por ter efeito colateral: marca os jobs como "running" ao devolver.)
export async function POST() {
  // Antes de claimar: promove agendamentos vencidos → fila (sem timer dedicado).
  await processDueSchedules();
  return Response.json(await claimPending());
}
