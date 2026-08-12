import { z } from "zod";

/**
 * Validação server-side do módulo de automações.
 *
 * Módulo puro (sem "server-only") pra ser testável via tsx --test.
 * Limites vêm do IMPLEMENTATION_PLAN.md (P2.21): máx. 10 steps, mensagem
 * 1–1000 chars, espera 5 min–30 dias.
 *
 * REGRA ANTI-BAN (durável, decisão Igor 2026-07-28): automação só posta em
 * grupo, nunca DM. Os schemas de step são estritos — qualquer campo fora do
 * contrato (ex.: phone/jid) é rejeitado, não ignorado.
 */

/** Triggers disponíveis pro lojista. Allowlist positiva — os triggers de
 * lifecycle do SaaS (no_connect_24h, trial_ending) ficam de fora por design. */
export const LOJISTA_TRIGGERS = [
  "lead_entered",
  "signup",
  "group_full",
  "weekly_recurring",
  "group_stalled",
] as const;

export type LojistaTrigger = (typeof LOJISTA_TRIGGERS)[number];

export const MAX_STEPS = 10;
export const MESSAGE_MAX_CHARS = 1000;
export const WAIT_MIN_MINUTES = 5;
export const WAIT_MAX_MINUTES = 43200; // 30 dias

const messageStepSchema = z.strictObject({
  id: z.string().min(1).max(64).optional(),
  type: z.literal("message"),
  delay_minutes: z.number().int().min(0).max(WAIT_MAX_MINUTES),
  message: z.string().trim().min(1).max(MESSAGE_MAX_CHARS),
  media_id: z.string().max(128).nullish(),
});

const waitStepSchema = z.strictObject({
  id: z.string().min(1).max(64).optional(),
  type: z.literal("wait"),
  delay_minutes: z.number().int().min(WAIT_MIN_MINUTES).max(WAIT_MAX_MINUTES),
});

// "condition" existe no tipo da store mas está fora do v1 (P2.21) — sem
// semântica de execução definida, não entra pela API.
const stepSchema = z.discriminatedUnion("type", [messageStepSchema, waitStepSchema]);

const stepsSchema = z
  .array(stepSchema)
  .min(1, "A automação precisa de pelo menos 1 passo.")
  .max(MAX_STEPS, `Máximo de ${MAX_STEPS} passos por automação.`)
  .refine((steps) => steps.some((s) => s.type === "message"), {
    message: "A automação precisa de pelo menos 1 passo de mensagem.",
  });

export const createAutomationSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome.").max(120),
  trigger: z.enum(LOJISTA_TRIGGERS),
  steps: stepsSchema,
});

export const patchAutomationSchema = z.object({
  id: z.string().min(1, "ID obrigatório."),
  name: z.string().trim().min(1).max(120).optional(),
  trigger: z.enum(LOJISTA_TRIGGERS).optional(),
  enabled: z.boolean().optional(),
  steps: stepsSchema.optional(),
});

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type PatchAutomationInput = z.infer<typeof patchAutomationSchema>;
export type ValidatedStep = z.infer<typeof stepSchema>;

/** Garante id em todo step (a UI usa step.id como key). Ids do cliente são preservados. */
export function normalizeSteps(steps: ValidatedStep[]): (ValidatedStep & { id: string })[] {
  return steps.map((step, i) => ({ ...step, id: step.id ?? `step-${i + 1}` }));
}

/** Primeira mensagem de erro do zod num formato apresentável pro client. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Payload inválido.";
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}
