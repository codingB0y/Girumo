import { flowPagesHealth } from "@/lib/pages/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Público: health do módulo Flow Pages (db + seed dos templates). */
export async function GET() {
  const health = await flowPagesHealth();
  const ok = health.db === "up" && health.templates_count >= 3;
  return Response.json({ ok, ...health }, { status: ok ? 200 : 503 });
}
