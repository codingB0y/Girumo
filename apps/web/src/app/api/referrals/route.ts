import { after } from "next/server";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import {
  listReferrals,
  createReferral,
  removeReferral,
  getReferralConfig,
  type Referral,
} from "@/lib/stores/referrals";
import * as trackedLinks from "@/lib/stores/tracked-links";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { createLink, clickCounts, slugify } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME = 80;
const MAX_GROUP = 120;
const MAX_URL = 500;

type Ranked = {
  id: string;
  referrerName: string;
  group: string;
  slug: string;
  /** Caminho do link pessoal — é ISTO que a indicadora divulga, não o convite cru. */
  path: string;
  inviteUrl: string;
  cliques: number;
  atingiu: boolean;
};

function fail(e: unknown, status = 500) {
  if (e instanceof Response) return e;
  return Response.json({ error: (e as Error).message }, { status });
}

/** Violação de unicidade do slug é 409; qualquer outra coisa é 500 de verdade. */
function isConflict(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /duplicate key|already exists|unique constraint|23505/i.test(message);
}

/**
 * Cliques por slug. Vem do contador de `tracked_links`, que é o que `/r/:slug`
 * de fato incrementa. Antes esta rota lia `clicks.ndjson` do disco: em produção
 * o arquivo é efêmero (sempre vazio) e não tem tenant nenhum — a coluna
 * "cliques" do ranking era zero pra todo mundo, por construção.
 */
async function clicksBySlug(tenantId: string): Promise<Map<string, number>> {
  if (!USE_SUPABASE) {
    return new Map(Object.entries(await clickCounts()));
  }
  const links = await trackedLinks.listTrackedLinks(tenantId);
  return new Map(links.map((l) => [l.slug, l.clicks ?? 0]));
}

// GET /api/referrals — { config, ranking }
export async function GET(req: Request) {
  try {
    // `getRouteTenantContext` aceita cookie E Bearer do Supabase. O painel manda
    // Bearer (`authenticatedFetch`), e quem entra pelo Google só tem Bearer —
    // um helper só-cookie devolveria 401 justamente para esses.
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });

    const [refs, config, clicks] = await Promise.all([
      listReferrals(tenantId),
      getReferralConfig(tenantId),
      clicksBySlug(tenantId),
    ]);

    const ranking: Ranked[] = refs
      .map((r) => {
        const cliques = clicks.get(r.slug) ?? 0;
        return {
          id: r.id,
          referrerName: r.referrer_name,
          group: r.group_name,
          slug: r.slug,
          path: `/r/${r.slug}`,
          inviteUrl: r.invite_url,
          cliques,
          // Meta medida em CLIQUES porque clique é o único sinal que existe:
          // nada liga a entrada no grupo de volta à indicadora que trouxe.
          atingiu: cliques >= config.goal,
        };
      })
      .sort((a, b) => b.cliques - a.cliques);

    return Response.json({ config, ranking });
  } catch (e) {
    return fail(e);
  }
}

// POST /api/referrals — cria a indicadora e o link pessoal rastreável
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const referrerName = String(b.referrerName ?? "").trim().slice(0, MAX_NAME);
  const group = String(b.group ?? "").trim().slice(0, MAX_GROUP);
  const inviteUrl = String(b.inviteUrl ?? "").trim().slice(0, MAX_URL);

  if (!referrerName || !group) {
    return Response.json({ error: "Nome da indicadora e grupo são obrigatórios." }, { status: 400 });
  }
  if (!/^https:\/\/\S+$/i.test(inviteUrl)) {
    return Response.json(
      { error: "Cole o link de convite do grupo (ex.: https://chat.whatsapp.com/...)." },
      { status: 400 },
    );
  }

  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });

    // Sufixo aleatório, não `Date.now()`: o slug é único GLOBALMENTE em
    // `tracked_links`, e dois cadastros no mesmo milissegundo colidiam.
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
    const base = slugify(referrerName).slice(0, 14) || "indicacao";
    const slug = `ind-${base}-${suffix}`;

    if (USE_SUPABASE) {
      await trackedLinks.createTrackedLink(tenantId, {
        slug,
        target_url: inviteUrl,
        metadata: { kind: "referral", referrerName, groupName: group },
      });
    } else {
      await createLink({
        slug,
        destinationUrl: inviteUrl,
        targetGroupName: group,
        campaignName: `Indicação ${referrerName}`,
      });
    }

    let rec: Referral;
    try {
      rec = await createReferral(tenantId, { referrerName, group, slug, inviteUrl });
    } catch (e) {
      // O link já existe neste ponto. Sem desfazer, sobra um `/r/:slug` vivo
      // que nenhuma tela mostra e ninguém consegue apagar.
      if (USE_SUPABASE) {
        await trackedLinks.deleteTrackedLinkBySlug(tenantId, slug).catch(() => {});
      }
      throw e;
    }

    // Marco de ativação: o lojista pôs alguém pra captar por ele.
    after(() =>
      trackFunnelEvent({
        tenantId,
        userId: null,
        event: "referral_sent",
        onlyFirst: true,
        metadata: { referralId: rec.id },
      }),
    );

    return Response.json(
      {
        id: rec.id,
        referrerName: rec.referrer_name,
        group: rec.group_name,
        slug: rec.slug,
        path: `/r/${rec.slug}`,
        inviteUrl: rec.invite_url,
        cliques: 0,
        atingiu: false,
      },
      { status: 201 },
    );
  } catch (e) {
    return fail(e, isConflict(e) ? 409 : 500);
  }
}

// DELETE /api/referrals?id=
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });

  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });

    const removed = await removeReferral(tenantId, id);
    // Nada casou: id inexistente ou de outro tenant. Responder `ok` aqui era
    // mentir — o painel sumia com a linha e ela voltava no próximo reload.
    if (!removed) return Response.json({ error: "Indicação não encontrada." }, { status: 404 });

    if (USE_SUPABASE) {
      await trackedLinks.deleteTrackedLinkBySlug(tenantId, removed.slug).catch(() => {});
    }

    return Response.json({ ok: true, id: removed.id });
  } catch (e) {
    return fail(e);
  }
}
