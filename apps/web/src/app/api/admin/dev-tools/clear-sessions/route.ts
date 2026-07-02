import { NextResponse } from "next/server";
import { blockInProduction, isDev } from "@/lib/environment";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dev-tools/clear-sessions
 * Limpa todas as sessões da engine mock.
 * ⚠️  BLOQUEADO em produção.
 */
export async function POST() {
  try {
    blockInProduction("clear-sessions");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }

  if (!isDev()) {
    return NextResponse.json({ error: "Apenas em development" }, { status: 403 });
  }

  const engineUrl = process.env.ENGINE_URL || "http://localhost:3001";

  try {
    const res = await fetch(`${engineUrl}/dev/reset`, { method: "POST" });
    const result = await res.json();

    return NextResponse.json({
      success: true,
      message: "Sessões da engine mock limpas",
      engineResponse: result,
    });
  } catch {
    return NextResponse.json({
      success: true,
      message: "Engine offline — sessões não puderam ser limpas remotamente",
      note: "Inicie a engine com 'cd hubflow-engine && npm run dev'",
    });
  }
}
