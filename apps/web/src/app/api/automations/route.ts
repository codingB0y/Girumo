import * as store from "@/lib/stores/automations";
import { AUTOMATION_TEMPLATES } from "@/lib/stores/automations";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { assertPermission } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/automations — lista automações do tenant
export async function GET(req: Request) {
  const { tenantId } = await getTenantContext(req);

  const automations = await store.listAutomations(tenantId);
  return Response.json(automations);
}

// POST /api/automations — cria automação (ou instancia de template)
export async function POST(req: Request) {
  const ctx = await getTenantContext(req);
  assertPermission(ctx.role, "campaign:create");
  const tenantId = ctx.tenantId;

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
  const ctx = await getTenantContext(req);
  assertPermission(ctx.role, "campaign:edit");
  const tenantId = ctx.tenantId;

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
  const ctx = await getTenantContext(req);
  assertPermission(ctx.role, "campaign:delete");
  const tenantId = ctx.tenantId;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "ID obrigatório." }, { status: 400 });

  await store.deleteAutomation(tenantId, id);
  return Response.json({ success: true });
}
