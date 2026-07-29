import { collection } from "@/lib/json-collection";
import { createLink, clickCounts, slugify } from "@/lib/store";
import { listLeads } from "@/lib/leads-store";
import type { AdCampaign, AdStatus } from "@/lib/mock-data";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const coll = collection<AdCampaign>("ad-campaigns.json");

// GET — campanhas com métricas REAIS: cliques (do link rastreado) e entradas
// (leads no grupo de destino). spend/cpl ficam manuais (vêm do Meta).
export async function GET(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  const [camps, counts, leads] = await Promise.all([coll.list(), clickCounts(), listLeads(tenantId)]);
  const data = camps.map((c) => {
    const clicks = counts[c.linkSlug] ?? 0;
    // Atribuição robusta: por JID do grupo (independe do nome); cai p/ nome se faltar.
    const entries = leads.filter((l) =>
      c.targetGroupId && l.sourceGroupId ? l.sourceGroupId === c.targetGroupId : l.sourceGroup === c.targetGroupName,
    ).length;
    const cpl = entries > 0 && c.spend > 0 ? c.spend / entries : 0;
    return { ...c, clicks, entries, cpl };
  });
  return Response.json(data);
}

// POST — cria a campanha E o link rastreável real (destino = convite do grupo).
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const name = String(b.name ?? "").trim();
  const targetGroupName = String(b.targetGroupName ?? "").trim();
  const inviteUrl = String(b.inviteUrl ?? "").trim();
  if (!name || !targetGroupName) {
    return Response.json({ error: "name e targetGroupName obrigatórios." }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(inviteUrl)) {
    return Response.json(
      { error: "Cole o link de convite do grupo (https://chat.whatsapp.com/...)." },
      { status: 400 },
    );
  }

  // Cria o link rastreável que será o DESTINO do anúncio (redireciona p/ o convite).
  const slug = `${slugify(targetGroupName).slice(0, 20)}-${Date.now().toString(36).slice(-4)}`;
  const pixelId = String(b.pixelId ?? "").replace(/\D/g, "");
  try {
    await createLink({ slug, destinationUrl: inviteUrl, targetGroupName, campaignName: name, pixelId: pixelId || undefined });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }

  const creativeIdeas = Array.isArray(b.creativeIdeas) ? b.creativeIdeas.map(String) : [];
  const rec = await coll.create({
    name,
    targetGroupId: String(b.targetGroupId ?? ""),
    targetGroupName,
    status: "ativa" as AdStatus,
    objective: String(b.objective ?? "Entradas no grupo"),
    budgetDaily: Number(b.budgetDaily) || 0,
    audience: String(b.audience ?? ""),
    primaryText: String(b.primaryText ?? ""),
    headline: String(b.headline ?? ""),
    description: String(b.description ?? ""),
    script: String(b.script ?? ""),
    creativeIdeas,
    linkSlug: slug,
    inviteUrl,
    spend: 0,
    clicks: 0,
    entries: 0,
    cpl: 0,
  });
  return Response.json(rec, { status: 201 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  await coll.remove(id);
  return Response.json({ ok: true });
}
