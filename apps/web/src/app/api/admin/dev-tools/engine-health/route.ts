import { NextResponse } from "next/server";
import { blockInProduction, isDev } from "@/lib/environment";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dev-tools/engine-health
 * Verifica se a engine mock está rodando.
 * ⚠️  BLOQUEADO em produção.
 */
export async function GET() {
  try {
    blockInProduction("engine-health");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }

  if (!isDev()) {
    return NextResponse.json({ error: "Apenas em development" }, { status: 403 });
  }

  const engineUrl = process.env.ENGINE_URL || "http://localhost:3001";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${engineUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        success: true,
        status: "online",
        engine: data,
        url: engineUrl,
      });
    }

    return NextResponse.json({
      success: false,
      status: "unhealthy",
      httpStatus: res.status,
      url: engineUrl,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      status: "offline",
      url: engineUrl,
      error: err instanceof Error ? err.message : "Connection refused",
      hint: "Execute: cd hubflow-engine && npm run dev",
    });
  }
}
