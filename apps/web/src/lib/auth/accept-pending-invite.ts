import type { SupabaseClient } from "@supabase/supabase-js";
import { selectPendingInvite, type InviteOwnershipProof, type PendingInvite } from "./pending-invite";

/**
 * Convites pendentes (sem usuário, não aceitos) para o e-mail. Devolve null se
 * a consulta falhar — o chamador decide se isso bloqueia ou só segue sem convite.
 *
 * O `ilike` pode trazer linhas a mais (`_` e `%` são curinga); quem decide usa
 * `selectPendingInvite`/`requiresInviteLink`, que casam o e-mail exato.
 */
export async function listPendingInvites(
  supabase: SupabaseClient,
  email: string,
): Promise<PendingInvite[] | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("id, tenant_id, role, invited_email, created_at")
    .is("user_id", null)
    .is("accepted_at", null)
    .ilike("invited_email", email)
    .order("created_at", { ascending: true });

  return error ? null : (data ?? []);
}

/**
 * Vincula o usuário recém-autenticado ao convite pendente do seu e-mail, se
 * houver, e devolve o tenant do convite. Retorna null quando não há convite —
 * aí o chamador segue para o provisionamento de conta nova.
 *
 * Usada pelos DOIS caminhos de cadastro (login social e e-mail/senha). Sem
 * isso, o convidado é tratado como conta nova e ganha uma organização vazia,
 * com o convite pendurado para sempre — o "tenant fantasma".
 *
 * Só aceita com prova de posse do e-mail (`proof`): o link do convite ou o
 * Google. Sem ela devolve null e o chamador segue como conta nova — o convite
 * fica intacto para a dona do e-mail.
 *
 * Recebe o client por parâmetro e tipa com `import type` para não puxar o
 * módulo `server-only` em tempo de execução.
 */
export async function acceptPendingInvite(
  supabase: SupabaseClient,
  authUserId: string,
  email: string,
  displayName: string,
  proof: InviteOwnershipProof | null,
): Promise<{ tenant_id: string; role: string | null } | null> {
  if (!proof) return null;

  const pending = await listPendingInvites(supabase, email);
  if (!pending?.length) return null;

  const invite = selectPendingInvite(pending, email, proof);
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
