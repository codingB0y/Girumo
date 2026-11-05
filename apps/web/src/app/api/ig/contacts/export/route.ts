import { requirePessoas } from "@/lib/ig/access";
import { csvDePessoas } from "@/lib/ig/pessoas-csv";
import { lerFiltrosDaUrl, nomesDosFluxos, paraPessoa, responderErro } from "@/lib/ig/pessoas-http";
import { collectContacts } from "@/lib/stores/ig-contacts-lista";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/ig/contacts/export?<mesmos filtros> — CSV das pessoas. Só dono ou admin; vale também nos 30 dias depois de cancelar.
export async function GET(req: Request) {
  try {
    const { ctx } = await requirePessoas(req, "exportar");
    const entrada = lerFiltrosDaUrl(new URL(req.url).searchParams);
    if (!entrada) return Response.json({ error: "Filtro inválido." }, { status: 400 });
    const [rows, fluxos] = await Promise.all([collectContacts(ctx.tenantId, entrada.filtros), nomesDosFluxos(ctx.tenantId)]);
    return new Response(csvDePessoas(rows.map((r) => paraPessoa(r, fluxos))), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pessoas-instagram-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return responderErro(e);
  }
}
