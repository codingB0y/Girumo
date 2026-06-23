import { claimGrow, evaluateAutoGrow } from "@/lib/group-grow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/groups/grow/pending — a ENGINE reivindica os grupos a criar.
// Antes do claim, avalia o auto-grow (proativo a 90%) e enfileira o que precisa.
export async function POST() {
  await evaluateAutoGrow();
  return Response.json(await claimGrow());
}
