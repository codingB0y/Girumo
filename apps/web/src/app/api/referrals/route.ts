import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { listReferrals, createReferral, removeReferral, getReferralConfig } from "@/lib/stores/referrals";
import { createLink, listClicks } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// GET /api/referrals — ranking com cliques e entradas
export async function GET() {
  try {
    const [refs, config, clicks] = await Promise.all([
      listReferrals(),
      getReferralConfig(),
      listClicks(),
    ]);

    const clicksBySlug = new Map<string, number>();
    for (const c of clicks) {
      clicksBySlug.set(c.slug, (clicksBySlug.get(c.slug) ?? 0) + 1);
    }

    const ranking = refs.map((r) => {
      const cliques = clicksBySlug.get(r.slug) ?? 0;
      return {
        id: r.id,
        referrerName: r.referrer_name,
        group: r.group_name,
        slug: r.slug,
        inviteUrl: r.invite_url,
        cliques,
        entradas: 0, // TODO: correlate with leads
        atingiu: false,
      };
    });

    return Response.json({ config, ranking });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/referrals — cria link pessoal rastreável
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const referrerName = String(b.referrerName ?? "").trim();
  const group = String(b.group ?? "").trim();
  const inviteUrl = String(b.inviteUrl ?? "").trim();
  if (!referrerName || !group) {
    return Response.json({ error: "Nome da revendedora e grupo são obrigatórios." }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(inviteUrl)) {
    return Response.json({ error: "Cole o link de convite do grupo (chat.whatsapp.com/...)." }, { status: 400 });
  }

  const slug = `ind-${slugify(referrerName).slice(0, 14)}-${Date.now().toString(36).slice(-4)}`;
  try {
    await createLink({ slug, destinationUrl: inviteUrl, targetGroupName: group, campaignName: `Indicação ${referrerName}` });
    const rec = await createReferral({ referrerName, group, slug, inviteUrl });

    // Marco: o lojista pôs uma revendedora pra captar por ele. `tenant_id` vem
    // do próprio registro — esta rota resolve o tenant dentro da store, não aqui.
    if (rec.tenant_id) {
      void trackFunnelEvent({
        tenantId: rec.tenant_id,
        userId: null,
        event: "referral_sent",
        onlyFirst: true,
        metadata: { referralId: rec.id },
      });
    }

    return Response.json({
      id: rec.id,
      referrerName: rec.referrer_name,
      group: rec.group_name,
      slug: rec.slug,
      inviteUrl: rec.invite_url,
    }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}

// DELETE /api/referrals?id=
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  try {
    await removeReferral(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
