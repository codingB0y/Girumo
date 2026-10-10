import { getSessionAccountId } from "@/lib/session";
import { findMembershipTenantId } from "@/lib/session-tenant";
import { generateCopy, type CopyInput } from "@/lib/agents/copy-agent";
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

  // Tenant pelo resolvedor guardado, ANTES de gerar: quem não tem esta rota
  // liberada (a vendedora) não chega ao agente. Antes a rota lia `memberships`
  // por conta própria, depois de gerar, sem `x-tenant-id` e sem o guard.
  const tenantId = await findMembershipTenantId(authUserId, req);
  if (!tenantId) {
    return Response.json({ error: "Tenant não encontrado." }, { status: 403 });
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

  // Increment agent execution count (non-blocking)
  getSupabaseAdmin()
    .from("agent_configs")
    .upsert(
      {
        tenant_id: tenantId,
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

  return Response.json(result);
}
