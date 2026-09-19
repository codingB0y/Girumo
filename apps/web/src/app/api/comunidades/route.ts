import { getTenantContext } from "@/lib/supabase/tenant-context";
import { assertPermission } from "@/lib/permissions";
import { assertPlanLimit } from "@/lib/billing/entitlements";
import { listarComunidades, criarComunidade } from "@/lib/stores/communities";
import * as groupsStore from "@/lib/stores/groups";
import { gruposOrfaos } from "@/lib/communities/orfaos";
import { ehEstruturaDeComunidade } from "@/lib/communities/estrutura";
import { validarNomeComunidade } from "@/lib/communities/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/comunidades
 *
 * Devolve as comunidades do tenant e os grupos órfãos (fora de qualquer
 * comunidade) — a tela precisa dos dois na primeira carga, sem uma segunda
 * chamada. `comunidades` já É `campaign_groups`; não é tabela nova.
 */
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);

    const [comunidades, grupos] = await Promise.all([
      listarComunidades(ctx.tenantId),
      groupsStore.listGroups(ctx.tenantId),
    ]);

    // `campaign_groups.group_ids` guarda whatsapp_group_id, não o UUID de
    // `groups.id` — casar pelo mesmo campo é o que faz o cálculo de órfãos
    // bater com produção (ver comentário em lib/communities/orfaos.ts).
    //
    // `name` e `members` viajam junto (Task 2.5): a faixa de órfãos da tela
    // precisa exibir nome e tamanho de cada grupo sem uma segunda chamada a
    // /api/groups. `gruposOrfaos<T>` é genérica — devolver um objeto mais rico
    // que `GrupoRef` continua satisfazendo a assinatura.
    //
    // Pai e Avisos de uma comunidade nativa nunca entram em `group_ids`
    // (`memberGroupIds` os exclui de propósito, ver reconciliar.ts) — sem
    // este filtro os dois nunca contam como "atribuídos" e a faixa de órfãos
    // acusa "sem comunidade" justamente as duas peças da comunidade que os
    // tem. Mesmo predicado de `lib/communities/estrutura.ts` usado por
    // `carregarGrupos` para tirar os dois da lista de disparo.
    const orfaos = gruposOrfaos(
      grupos
        .filter((grupo) => !ehEstruturaDeComunidade(grupo))
        .map((grupo) => ({
          whatsappGroupId: grupo.whatsapp_group_id,
          name: grupo.name,
          members: grupo.members,
        })),
      comunidades,
    );

    return Response.json({ comunidades, orfaos });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/comunidades] falha ao listar:", error);
    return Response.json({ error: "Erro ao listar comunidades." }, { status: 500 });
  }
}

/**
 * POST /api/comunidades — body { nome }
 *
 * `campaign:create` e `campaigns:create` (mesmo teto de plano das campanhas):
 * comunidade é uma linha nova em `campaign_groups`, a mesma tabela que o teto
 * de campanhas já conta — sem o gate aqui, criar "comunidades" seria uma
 * porta pra furar o limite de campanhas do plano. Pelo mesmo motivo nasce com
 * o link mestre `/r/<slug>` (ver `criarComunidade`).
 */
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "campaign:create");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const nomeInput = body && typeof body === "object" ? (body as Record<string, unknown>).nome : undefined;
    const validado = validarNomeComunidade(nomeInput);
    if (!validado.ok) return Response.json({ error: validado.error }, { status: 400 });

    await assertPlanLimit(ctx.tenantId, "campaigns:create");

    const comunidade = await criarComunidade(ctx.tenantId, { nome: validado.nome }, ctx.authUserId);
    if (!comunidade) {
      return Response.json(
        { error: "Não foi possível gerar o link da comunidade. Tente de novo." },
        { status: 409 },
      );
    }
    return Response.json(comunidade, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/comunidades] falha ao criar:", error);
    return Response.json({ error: "Erro ao criar comunidade." }, { status: 500 });
  }
}
