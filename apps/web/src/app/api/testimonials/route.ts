import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getSessionAccountId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const authUserId = await getSessionAccountId();
  if (!authUserId) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: { quote?: string; rating?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const quote = String(body.quote ?? "").trim();
  const rating = Math.min(5, Math.max(1, Number(body.rating) || 5));

  if (quote.length < 10) {
    return Response.json({ error: "Depoimento precisa ter pelo menos 10 caracteres." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Resolve tenant and user info
  const { data: membership } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return Response.json({ error: "Tenant não encontrado." }, { status: 403 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", membership.tenant_id)
    .maybeSingle();

  const { error } = await supabase.from("testimonials").insert({
    tenant_id: membership.tenant_id,
    name: user?.name ?? "Lojista",
    store: org?.name ?? "",
    quote,
    rating,
    approved: false,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true }, { status: 201 });
}
