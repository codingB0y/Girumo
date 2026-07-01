import { getSessionAccountId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import * as store from "@/lib/stores/automations";
import { AUTOMATION_TEMPLATES } from "@/lib/stores/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveTenantId(): Promise<string | null> {
  const authUserId = await getSessionAccountId();
  if (!authUserId) return null;
  const { data } = await getSupabaseAdmin()
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

// GET /api/automations — lista automações do tenant
export async function GET() {
  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json([], { status: 200 });

  const automations = await store.listAutomations(tenantId);
  return Response.json(automations);
}

// POST /api/automations — cria automação (ou instancia de template)
export async function POST(req: Request) {
  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  // Se veio templateIndex, usar template pré-definido
  if (typeof body.templateIndex === "number") {
    const tpl = AUTOMATION_TEMPLATES[body.templateIndex];
    if (!tpl) return Response.json({ error: "Template não encontrado." }, { status: 400 });

    const steps = tpl.steps.map((s, i) => ({ ...s, id: `step-${i + 1}` }));
    const automation = await store.createAutomation(tenantId, {
      name: tpl.name,
      trigger: tpl.trigger,
      steps,
    });
    return Response.json(automation, { status: 201 });
  }

  // Criação manual
  const name = String(body.name ?? "").trim();
  const trigger = String(body.trigger ?? "") as store.AutomationTrigger;
  const steps = Array.isArray(body.steps) ? body.steps : [];

  if (!name) return Response.json({ error: "Informe um nome." }, { status: 400 });
  if (!trigger) return Response.json({ error: "Informe um trigger." }, { status: 400 });

  const automation = await store.createAutomation(tenantId, { name, trigger, steps });
  return Response.json(automation, { status: 201 });
}

// PATCH /api/automations — atualiza automação
export async function PATCH(req: Request) {
  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const id = String(body.id ?? "");
  if (!id) return Response.json({ error: "ID obrigatório." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.trigger !== undefined) patch.trigger = String(body.trigger);
  if (body.enabled !== undefined) patch.enabled = body.enabled === true;
  if (body.steps !== undefined) patch.steps = body.steps;

  const updated = await store.updateAutomation(tenantId, id, patch as Parameters<typeof store.updateAutomation>[2]);
  if (!updated) return Response.json({ error: "Automação não encontrada." }, { status: 404 });
  return Response.json(updated);
}

// DELETE /api/automations — deleta automação
export async function DELETE(req: Request) {
  const tenantId = await resolveTenantId();
  if (!tenantId) return Response.json({ error: "Tenant não encontrado." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "ID obrigatório." }, { status: 400 });

  await store.deleteAutomation(tenantId, id);
  return Response.json({ success: true });
}
