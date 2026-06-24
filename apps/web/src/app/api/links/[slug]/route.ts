import { getClickAnalytics } from "@/lib/clicks-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/links/:slug — analytics de cliques do link (total, por dia, por origem UTM).
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return Response.json(await getClickAnalytics(slug));
}
