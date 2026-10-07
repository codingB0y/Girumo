import { getAppUrl } from "@/lib/environment";
import { requireInstagram } from "@/lib/ig/access";
import { lerEstado } from "@/lib/ig/connect/state";
import { connectStateSecret, zernioApiKey } from "@/lib/ig/segredos";
import { ZernioError } from "@/lib/ig/transport/types";
import { createZernioTransport } from "@/lib/ig/transport/zernio";
import { assertPermission } from "@/lib/permissions";
import { upsertAccount } from "@/lib/stores/ig-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Erro = "estado" | "cancelado" | "conta" | "outra_loja" | "permissao" | "zernio";

// GET /api/ig/connect/callback — a volta da Zernio. Confere o `state` contra a
// loja da sessão e IGNORA os ids da query: pergunta à Zernio qual conta entrou
// no perfil. Sempre termina num 303 pra lista, com `conectado=1` ou `erro=`.
export async function GET(req: Request) {
  const query = new URL(req.url).searchParams;
  const lista = `${getAppUrl()}/painel/instagram`;
  const volta = (resultado: "conectado=1" | `erro=${Erro}`) => Response.redirect(`${lista}?${resultado}`, 303);
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:edit");
    const estado = lerEstado(query.get("state"), connectStateSecret());
    if (!estado || estado.tenantId !== ctx.tenantId) return volta("erro=estado");
    if (query.get("error")) return volta(query.get("error") === "oauth_denied" ? "erro=cancelado" : "erro=zernio");

    const todas = await createZernioTransport({ apiKey: zernioApiKey() }).listAccounts(estado.profileId);
    const contas = todas.filter((c) => c.isActive && !c.needsReconnection);
    const dica = query.get("accountId");
    // A query só dá a dica de qual; a lista do perfil é quem vale.
    const conta = contas.find((c) => c.id === dica) ?? (contas.length === 1 ? contas[0] : null);
    if (!conta) return volta("erro=conta");
    const gravada = await upsertAccount(ctx.tenantId, { providerAccountId: conta.id, providerProfileId: estado.profileId, username: conta.username });
    if (!gravada) return volta("erro=outra_loja");
    return volta("conectado=1");
  } catch (e) {
    // É navegação do navegador: nada de JSON cru na tela, sempre de volta pra lista.
    if (e instanceof Response) return e.status === 401 ? Response.redirect(`${getAppUrl()}/login`, 303) : volta("erro=permissao");
    if (!(e instanceof ZernioError)) console.error("[ig/connect/callback]", e instanceof Error ? e.message : "erro");
    return volta("erro=zernio");
  }
}
