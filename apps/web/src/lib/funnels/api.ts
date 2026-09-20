import { FUNNEL_TEMPLATE_IDS, type FunnelTemplateId } from "./templates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FunnelFields = { funnel_template_id: FunnelTemplateId; funnel_run_id: string };

/**
 * Corpo de POST /api/campanhas/[slug]/messages: `funnelTemplateId` e
 * `funnelRunId` são opcionais, mas vêm juntos e válidos ou não vêm.
 */
export function parseFunnelFields(
  body: Record<string, unknown>,
): { ok: true; fields: FunnelFields | null } | { ok: false; error: string } {
  const template = body.funnelTemplateId;
  const run = body.funnelRunId;
  if (template === undefined && run === undefined) return { ok: true, fields: null };
  if (typeof template !== "string" || !FUNNEL_TEMPLATE_IDS.has(template)) {
    return { ok: false, error: "Roteiro de funil desconhecido." };
  }
  if (typeof run !== "string" || !UUID.test(run)) {
    return { ok: false, error: "funnelRunId inválido." };
  }
  return { ok: true, fields: { funnel_template_id: template as FunnelTemplateId, funnel_run_id: run } };
}
