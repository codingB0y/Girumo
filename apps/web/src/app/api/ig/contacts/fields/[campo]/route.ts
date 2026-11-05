import { requirePessoas } from "@/lib/ig/access";
import { isValidFieldKey } from "@/lib/ig/flow/names";
import { responderErro } from "@/lib/ig/pessoas-http";
import { fieldValues } from "@/lib/stores/ig-contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ig/contacts/fields/[campo] — os valores que existem na loja para o campo, com a contagem (filtro "campo = valor").
export async function GET(req: Request, { params }: { params: Promise<{ campo: string }> }) {
  try {
    const { ctx } = await requirePessoas(req, "ler");
    const { campo } = await params;
    if (!isValidFieldKey(campo)) return Response.json({ error: "Campo inválido." }, { status: 400 });
    return Response.json({ valores: await fieldValues(ctx.tenantId, campo) });
  } catch (e) {
    return responderErro(e);
  }
}
