import { referralsColl, getReferralConfig, type Referral } from "@/lib/referrals-store";
import { createLink, listClicks, slugify } from "@/lib/store";
import { listLeads } from "@/lib/leads-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 30 * 60_000; // entrada atribuída a um clique até 30min antes

// GET /api/referrals — ranking com cliques (exato) e entradas prováveis (janela).
export async function GET() {
  const [refs, leads, clicks, config] = await Promise.all([
    referralsColl.list(),
    listLeads(),
    listClicks(),
    getReferralConfig(),
  ]);

  const timesBySlug = new Map<string, number[]>();
  for (const c of clicks) {
    const arr = timesBySlug.get(c.slug) ?? [];
    arr.push(new Date(c.ts).getTime());
    timesBySlug.set(c.slug, arr);
  }

  // Atribui cada entrada à indicação cujo clique (mesmo grupo) é o mais próximo antes.
  const entradasByRef = new Map<string, number>();
  for (const lead of leads) {
    const T = new Date(lead.enteredAt).getTime();
    let bestId: string | null = null;
    let bestDelta = Infinity;
    for (const ref of refs) {
      if (ref.group !== lead.sourceGroup) continue;
      for (const ct of timesBySlug.get(ref.slug) ?? []) {
        const delta = T - ct;
        if (delta >= 0 && delta <= WINDOW_MS && delta < bestDelta) {
          bestDelta = delta;
          bestId = ref.id;
        }
      }
    }
    if (bestId) entradasByRef.set(bestId, (entradasByRef.get(bestId) ?? 0) + 1);
  }

  const data = refs
    .map((r) => {
      const cliques = (timesBySlug.get(r.slug) ?? []).length;
      const entradas = entradasByRef.get(r.id) ?? 0;
      return { ...r, cliques, entradas, atingiu: entradas >= config.goal };
    })
    .sort((a, b) => b.entradas - a.entradas || b.cliques - a.cliques);

  return Response.json({ config, ranking: data });
}

// POST /api/referrals — cria o link pessoal rastreável de uma revendedora.
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
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
  const rec = await referralsColl.create({ referrerName, group, slug, inviteUrl, createdAt: new Date().toISOString() } as Omit<Referral, "id">);
  return Response.json(rec, { status: 201 });
}

// DELETE /api/referrals?id=
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  await referralsColl.remove(id);
  return Response.json({ ok: true });
}
