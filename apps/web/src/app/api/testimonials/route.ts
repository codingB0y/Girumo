import { getSessionAccountId } from "@/lib/session";
import { findMembershipTenantId } from "@/lib/session-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const authUserId = await getSessionAccountId();
  if (!authUserId) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: { quote?: string; rating?: number; consentPublic?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const quote = String(body.quote ?? "").trim();
  const rating = Math.min(5, Math.max(1, Number(body.rating) || 5));
  const consentPublic = body.consentPublic === true;

  if (quote.length < 10) {
    return Response.json({ error: "Depoimento precisa ter pelo menos 10 caracteres." }, { status: 400 });
  }

  // Tenant pelo resolvedor guardado (`x-tenant-id` + guard de módulo). Antes a
  // rota lia `memberships` por conta própria e pegava sempre a mais antiga.
  const tenantId = await findMembershipTenantId(authUserId, req);
  if (!tenantId) {
    return Response.json({ error: "Tenant não encontrado." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();

  // `users` tem uma linha por loja: sem o tenant, quem está em duas lojas cai
  // no erro de mais-de-uma-linha do maybeSingle e vira "Lojista".
  const { data: user } = await supabase
    .from("users")
    .select("name")
    .eq("tenant_id", tenantId)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  const { error } = await supabase.from("testimonials").insert({
    tenant_id: tenantId,
    name: user?.name ?? "Lojista",
    store: org?.name ?? "",
    quote,
    rating,
    consent_public: consentPublic,
    approved: false,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true }, { status: 201 });
}
