import { listLinks, createLink, clickCounts, slugify } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/links — lista links com a contagem REAL de cliques.
export async function GET() {
  const [links, counts] = await Promise.all([listLinks(), clickCounts()]);
  const data = links
    .map((l) => ({ ...l, clicks: counts[l.slug] ?? 0 }))
    .sort((a, b) => b.clicks - a.clicks);
  return Response.json(data);
}

// POST /api/links — cria um novo link rastreado.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const destinationUrl = String(body.destinationUrl ?? "").trim();
  const rawSlug = String(body.slug ?? "").trim();
  const targetGroupName = String(body.targetGroupName ?? "").trim();
  const campaignName = String(body.campaignName ?? "").trim();
  const pixelId = String(body.pixelId ?? "").replace(/\D/g, "");
  const capRaw = Number(body.clickCap);
  const clickCap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : undefined;

  if (!destinationUrl || !/^https?:\/\//i.test(destinationUrl)) {
    return Response.json(
      { error: "Informe um link de destino válido (https://...)." },
      { status: 400 },
    );
  }

  const slug = slugify(rawSlug || campaignName || targetGroupName || "link");
  if (!slug) {
    return Response.json({ error: "Não foi possível gerar o slug." }, { status: 400 });
  }

  try {
    const link = await createLink({ slug, destinationUrl, targetGroupName, campaignName, pixelId: pixelId || undefined, clickCap });
    return Response.json(link, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
