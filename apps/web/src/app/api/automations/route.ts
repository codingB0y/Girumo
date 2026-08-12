import * as store from "@/lib/stores/automations";
import { AUTOMATION_TEMPLATES, RETIRED_LOJISTA_TRIGGERS } from "@/lib/stores/automations";
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { assertPermission } from "@/lib/permissions";
import {
  createAutomationSchema,
  patchAutomationSchema,
  normalizeSteps,
  firstIssueMessage,
} from "@/lib/automations/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETIRED_TRIGGER_ERROR = "Este trigger é de lifecycle interno e não pode ser usado aqui.";

function isRetiredTrigger(value: unknown): boolean {
  return typeof value === "string" && (RETIRED_LOJISTA_TRIGGERS as string[]).includes(value);
}

// GET /api/automations — lista automações do tenant
export async function GET(req: Request) {
  try {
    const { tenantId } = await getTenantContext(req);
    const automations = await store.listAutomations(tenantId);
    return Response.json(automations);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao listar automações." }, { status: 500 });
  }
}

// POST /api/automations — cria automação (ou instancia de template)
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "campaign:create");
    const tenantId = ctx.tenantId;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    // Se veio templateIndex, usar template pré-definido (conteúdo é constante do server, já confiável)
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

    // Criação manual — allowlist positiva de trigger + schema estrito de steps
    if (isRetiredTrigger(body.trigger)) {
      return Response.json({ error: RETIRED_TRIGGER_ERROR }, { status: 400 });
    }
    const parsed = createAutomationSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
    }

    const automation = await store.createAutomation(tenantId, {
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      steps: normalizeSteps(parsed.data.steps),
    });
    return Response.json(automation, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao criar automação." }, { status: 500 });
  }
}

// PATCH /api/automations — atualiza automação
export async function PATCH(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "campaign:edit");
    const tenantId = ctx.tenantId;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    if (isRetiredTrigger(body.trigger)) {
      return Response.json({ error: RETIRED_TRIGGER_ERROR }, { status: 400 });
    }
    const parsed = patchAutomationSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
    }

    const { id, name, trigger, enabled, steps } = parsed.data;
    const patch: Parameters<typeof store.updateAutomation>[2] = {};
    if (name !== undefined) patch.name = name;
    if (trigger !== undefined) patch.trigger = trigger;
    if (enabled !== undefined) patch.enabled = enabled;
    if (steps !== undefined) patch.steps = normalizeSteps(steps);

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nenhum campo pra atualizar." }, { status: 400 });
    }

    const updated = await store.updateAutomation(tenantId, id, patch);
    if (!updated) return Response.json({ error: "Automação não encontrada." }, { status: 404 });
    return Response.json(updated);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao atualizar automação." }, { status: 500 });
  }
}

// DELETE /api/automations — deleta automação
export async function DELETE(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "campaign:delete");
    const tenantId = ctx.tenantId;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "ID obrigatório." }, { status: 400 });

    await store.deleteAutomation(tenantId, id);
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao excluir automação." }, { status: 500 });
  }
}
