import { z } from "zod";
import {
  MAX_BUTTON_LABEL,
  MAX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MAX_NODES,
  MAX_PUBLIC_REPLY,
  MAX_WAIT_MINUTES,
  type FlowDef,
} from "./types";

/**
 * Forma do fluxo na fronteira (PATCH do rascunho). Só estrutura: os limites de
 * negócio (bytes, campanha, regras da Meta) ficam em `validate.ts`, porque o
 * lojista precisa SALVAR um rascunho inválido e ver o que falta na lista.
 */
const id = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
const minutes = z.number().int().min(1).max(MAX_WAIT_MINUTES);
const texto = z.string().max(4000);

const triggerNode = z.strictObject({
  id,
  type: z.literal("trigger"),
  on: z.enum(["comment", "dm"]),
  keywords: z.array(z.string().max(MAX_KEYWORD_LENGTH)).max(MAX_KEYWORDS),
  postId: z.string().regex(/^\d{1,40}$/).nullable(),
  publicReply: z.string().max(MAX_PUBLIC_REPLY).nullable(),
  storyReplies: z.boolean(),
});
const messageNode = z.strictObject({
  id,
  type: z.literal("message"),
  text: texto,
  button: z.string().max(MAX_BUTTON_LABEL).nullable(),
  wait: z.strictObject({ minutes }).nullable(),
});
const inviteNode = z.strictObject({
  id,
  type: z.literal("invite"),
  text: texto,
  campaignSlug: z.string().max(80).nullable(),
  remindAfterMinutes: minutes.nullable(),
});
const conditionNode = z.strictObject({ id, type: z.literal("condition"), check: z.literal("follows") });

export const flowOutSchema = z.enum(["next", "replied", "timeout", "yes", "no", "clicked", "not_clicked"]);
export const flowNodeSchema = z.discriminatedUnion("type", [triggerNode, messageNode, inviteNode, conditionNode]);
export const flowEdgeSchema = z.strictObject({ from: id, out: flowOutSchema, to: id });
export const flowDefSchema = z.strictObject({
  v: z.literal(1),
  nodes: z.array(flowNodeSchema).min(1).max(MAX_NODES),
  edges: z.array(flowEdgeSchema).max(MAX_NODES * 2),
});

export function parseFlowDef(input: unknown): { ok: true; def: FlowDef } | { ok: false; error: string } {
  const r = flowDefSchema.safeParse(input);
  if (r.success) return { ok: true, def: r.data as FlowDef };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "fluxo"}: ${i.message}`).join("; ") };
}
