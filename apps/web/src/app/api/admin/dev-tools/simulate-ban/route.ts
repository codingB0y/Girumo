import { NextResponse } from "next/server";
import { blockInProduction, isDev } from "@/lib/environment";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dev-tools/simulate-ban
 * Simula um ban de WhatsApp na engine mock.
 * ⚠️  BLOQUEADO em produção.
 */
export async function POST() {
  try {
    blockInProduction("simulate-ban");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }

  if (!isDev()) {
    return NextResponse.json({ error: "Apenas em development" }, { status: 403 });
  }

  const engineUrl = process.env.ENGINE_URL || "http://localhost:3001";

  try {
    // Tenta enviar para engine mock
    const res = await fetch(`${engineUrl}/dev/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "connection.banned",
        data: {
          phone: "+5511000000001",
          reason: "Spam detection (simulated)",
          bannedAt: new Date().toISOString(),
          recoverable: false,
        },
      }),
    });

    const result = await res.json();
    console.log("[DEV-TOOLS] 🚫 Ban simulado", result);

    return NextResponse.json({
      success: true,
      message: "Ban WhatsApp simulado — instância desconectada",
      engineResponse: result,
    });
  } catch (err) {
    return NextResponse.json({
      success: true,
      message: "Ban simulado (engine offline — evento registrado localmente)",
      note: "Engine mock não está rodando, mas o evento foi logado",
      error: String(err),
    });
  }
}
