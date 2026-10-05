import { z } from "zod";
import { RECIPE_ORDER } from "./recipes";
import { flowDefSchema } from "./schema";

const nome = z.string().trim().min(1).max(80);

export const createBodySchema = z.strictObject({
  recipe: z.enum(RECIPE_ORDER as [string, ...string[]]),
  name: nome.optional(),
});

export const patchBodySchema = z
  .strictObject({ name: nome.optional(), draft: flowDefSchema.optional() })
  .refine((b) => b.name !== undefined || b.draft !== undefined, { message: "Nada para salvar." });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);
