import { responderToque } from "@/lib/bio/toque";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/p/bio/toque — beacon do toque num botão do link da bio (ver responderToque).
export async function POST(req: Request) {
  return responderToque(req);
}
