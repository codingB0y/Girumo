import { getSupabaseServerAnon } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inicia o fluxo OAuth com Google via Supabase.
 * Redireciona o browser para a tela de consentimento do Google.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") || "/painel";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const redirectTo = `${siteUrl}/api/auth/callback?next=${encodeURIComponent(next)}`;

  const supabase = getSupabaseServerAnon();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error || !data.url) {
    return Response.json({ error: "Não foi possível iniciar login com Google." }, { status: 500 });
  }

  return Response.redirect(data.url);
}
