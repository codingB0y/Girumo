import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin-guard";
import { loadQuadro } from "@/lib/stores/quadro";

export const dynamic = "force-dynamic";

/** GET — snapshot do quadro (cards + últimos 30 eventos). Alimenta o polling. */
export async function GET() {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await loadQuadro();
    return NextResponse.json(snapshot);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
