import { getSessionAccountId } from "@/lib/session";
import { generateCopy, type CopyInput } from "@/lib/agents/copy-agent";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = ["oferta", "novidade", "reativacao", "lancamento", "lembrete"] as const;
const VALID_TONES = ["direto", "divertido", "urgente", "premium"] as const;

export async function POST(req: Request) {
  const authUserId = await getSessionAccountId();
  if (!authUserId) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: Partial<CopyInput>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  // Validation
  const type = body.type as CopyInput["type"];
  const tone = body.tone as CopyInput["tone"];
  const product = String(body.product ?? "").trim();

  if (!type || !VALID_TYPES.includes(type)) {
    return Response.json({ error: `Tipo inválido. Use: ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!tone || !VALID_TONES.includes(tone)) {
    return Response.json({ error: `Tom inválido. Use: ${VALID_TONES.join(", ")}` }, { status: 400 });
  }
  if (!product || product.length < 2) {
    return Response.json({ error: "Informe o produto/serviço (mínimo 2 caracteres)." }, { status: 400 });
  }

  const input: CopyInput = {
    type,
    tone,
    product,
    price: body.price ? String(body.price) : undefined,
    discount: body.discount ? String(body.discount) : undefined,
    extraContext: body.extraContext ? String(body.extraContext).slice(0, 500) : undefined,
  };

  const result = await generateCopy(input);

  // Track agent usage (resolve tenant for tracking)
  const supabase = getSupabaseAdmin();
  const { data: membership } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle();

  if (membership) {
    // Increment agent execution count (non-blocking)
    supabase
      .from("agent_configs")
      .upsert(
        {
          tenant_id: membership.tenant_id,
          agent_id: "copy",
          enabled: true,
          total_executions: 1,
          last_execution_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,agent_id" },
      )
      .then(({ error }) => {
        if (error) console.warn("[copy-agent] Failed to track execution:", error.message);
      });
  }

  return Response.json(result);
}
