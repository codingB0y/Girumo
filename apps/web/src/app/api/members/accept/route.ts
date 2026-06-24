import { getSupabaseAdmin, getSupabaseAnonForToken } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function POST(req: Request) {
  const accessToken = getBearerToken(req);
  if (!accessToken) return Response.json({ error: "Nao autenticado." }, { status: 401 });

  const authClient = getSupabaseAnonForToken(accessToken);
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  const authUser = userData.user;

  if (userError || !authUser?.email) {
    return Response.json({ error: "Sessao Supabase invalida." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { inviteId?: string };
  const inviteId = String(body.inviteId ?? "").trim();
  if (!inviteId) return Response.json({ error: "inviteId obrigatorio." }, { status: 400 });

  const email = authUser.email.toLowerCase();
  const supabase = getSupabaseAdmin();

  const { data: invite, error: inviteError } = await supabase
    .from("memberships")
    .select("id, tenant_id, role, invited_email, accepted_at")
    .eq("id", inviteId)
    .is("user_id", null)
    .is("accepted_at", null)
    .maybeSingle();

  if (inviteError) return Response.json({ error: inviteError.message }, { status: 500 });
  if (!invite) return Response.json({ error: "Convite nao encontrado ou ja aceito." }, { status: 404 });
  if (String(invite.invited_email).toLowerCase() !== email) {
    return Response.json({ error: "Este convite pertence a outro e-mail." }, { status: 403 });
  }

  const tenantId = String(invite.tenant_id);
  const { error: updateError } = await supabase
    .from("memberships")
    .update({ user_id: authUser.id, accepted_at: new Date().toISOString() })
    .eq("id", inviteId);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  const displayName =
    typeof authUser.user_metadata?.name === "string" ? authUser.user_metadata.name : email.split("@")[0];

  await supabase.from("users").upsert(
    {
      tenant_id: tenantId,
      auth_user_id: authUser.id,
      name: displayName,
      email,
    },
    { onConflict: "tenant_id,auth_user_id" },
  );

  await supabase.from("logs").insert({
    tenant_id: tenantId,
    actor_user_id: authUser.id,
    level: "info",
    event: "membership.accepted",
    message: `Convite aceito por ${email}.`,
    metadata: { membership_id: inviteId, role: invite.role },
  });

  return Response.json({ tenantId, role: invite.role });
}
