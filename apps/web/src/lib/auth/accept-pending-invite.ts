import type { SupabaseClient } from "@supabase/supabase-js";
import { selectPendingInvite } from "./pending-invite";

/**
 * Vincula o usuário recém-autenticado ao convite pendente do seu e-mail, se
 * houver, e devolve o tenant do convite. Retorna null quando não há convite —
 * aí o chamador segue para o provisionamento de conta nova.
 *
 * Usada pelos DOIS caminhos de cadastro (login social e e-mail/senha). Sem
 * isso, o convidado é tratado como conta nova e ganha uma organização vazia,
 * com o convite pendurado para sempre — o "tenant fantasma".
 *
 * Recebe o client por parâmetro e tipa com `import type` para não puxar o
 * módulo `server-only` em tempo de execução.
 */
export async function acceptPendingInvite(
  supabase: SupabaseClient,
  authUserId: string,
  email: string,
  displayName: string,
): Promise<{ tenant_id: string; role: string | null } | null> {
  const { data: pending, error } = await supabase
    .from("memberships")
    .select("id, tenant_id, role, invited_email, created_at")
    .is("user_id", null)
    .is("accepted_at", null)
    .ilike("invited_email", email)
    .order("created_at", { ascending: true });

  if (error || !pending?.length) return null;

  const invite = selectPendingInvite(pending, email);
  if (!invite) return null;

  const { data: claimed, error: claimError } = await supabase
    .from("memberships")
    .update({ user_id: authUserId, accepted_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("user_id", null)
    .select("id")
    .maybeSingle();

  // Update não pegou linha: uma request concorrente do mesmo usuário já vinculou
  // este convite. Relê e, se a membership ficou com este `authUserId`, devolve o
  // tenant dela — nunca cai em criar org, que geraria o tenant fantasma.
  if (claimError || !claimed) {
    const { data: settled } = await supabase
      .from("memberships")
      .select("tenant_id, role")
      .eq("id", invite.id)
      .eq("user_id", authUserId)
      .maybeSingle();
    if (!settled) return null;
    return { tenant_id: String(settled.tenant_id), role: settled.role ?? null };
  }

  const tenantId = String(invite.tenant_id);

  await supabase.from("users").upsert(
    { tenant_id: tenantId, auth_user_id: authUserId, name: displayName, email },
    { onConflict: "tenant_id,auth_user_id" },
  );

  await supabase.from("logs").insert({
    tenant_id: tenantId,
    actor_user_id: authUserId,
    level: "info",
    event: "membership.accepted",
    message: `Convite aceito por ${email} no primeiro acesso.`,
    metadata: { membership_id: invite.id, role: invite.role },
  });

  return { tenant_id: tenantId, role: invite.role };
}
