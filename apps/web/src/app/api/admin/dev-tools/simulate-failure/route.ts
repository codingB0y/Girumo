import { NextResponse } from "next/server";
import { blockInProduction, isDev } from "@/lib/environment";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dev-tools/simulate-failure
 * Simula falha na engine — testa como o frontend lida com engine offline.
 * ⚠️  BLOQUEADO em produção.
 */
export async function POST() {
  try {
    blockInProduction("simulate-failure");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }

  if (!isDev()) {
    return NextResponse.json({ error: "Apenas em development" }, { status: 403 });
  }

  const engineUrl = process.env.ENGINE_URL || "http://localhost:3001";

  // Tenta verificar se engine está viva, e reporta falha
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${engineUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      return NextResponse.json({
        success: true,
        message: "Engine está online — simulando falha de resposta",
        simulated: {
          type: "engine.crash",
          timestamp: new Date().toISOString(),
          error: "ECONNREFUSED (simulated)",
          lastHealthy: new Date(Date.now() - 120000).toISOString(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Engine respondeu com erro — falha real detectada",
      status: res.status,
    });
  } catch {
    return NextResponse.json({
      success: true,
      message: "Engine offline — falha confirmada",
      simulated: {
        type: "engine.unreachable",
        timestamp: new Date().toISOString(),
        error: "Engine não respondeu em 2s",
        recommendation: "Verifique se 'npm run dev' está rodando no hubflow-engine",
      },
    });
  }
}
