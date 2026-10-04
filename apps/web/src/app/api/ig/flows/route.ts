import { requireInstagram } from "@/lib/ig/access";
import { createBodySchema } from "@/lib/ig/flow/body";
import { RECIPES, type RecipeId } from "@/lib/ig/flow/recipes";
import { assertPermission } from "@/lib/permissions";
import { createFlow, listFlows } from "@/lib/stores/ig-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireInstagram(req);
    return Response.json({ flows: await listFlows(ctx.tenantId) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

// POST /api/ig/flows — nasce rascunho, a partir de uma receita.
export async function POST(req: Request) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:create");
    const parsed = createBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Corpo inválido." }, { status: 400 });
    const recipe = RECIPES[parsed.data.recipe as RecipeId];
    const flow = await createFlow(ctx.tenantId, { name: parsed.data.name ?? recipe.titulo, recipe: recipe.id, draft: recipe.build() });
    return Response.json({ flow }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
