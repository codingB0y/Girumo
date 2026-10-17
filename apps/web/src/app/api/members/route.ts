import { after } from "next/server";
import { z } from "zod";
import { canRemoveMember } from "@/lib/auth/member-removal";
import { MODULOS_OPCIONAIS, parseModulos } from "@/lib/auth/modulos";
import { assertPlanLimit } from "@/lib/billing/entitlements";
import { sendEmail } from "@/lib/email/send";
import { inviteEmail } from "@/lib/email/templates";
import { getAppUrl } from "@/lib/environment";
import { parseInviteRole, type TenantRole } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { assertBillingRole, getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Só a FORMA do corpo. O papel quem decide é `parseInviteRole` e o e-mail, a
 * regex de sempre — aqui não entra uma segunda lista de papéis. `strictObject`:
 * chave a mais é 400, não ignorada em silêncio.
 */
const conviteSchema = z.strictObject({
  email: z.string().optional(),
  role: z.string().optional(),
  modules: z.array(z.enum(MODULOS_OPCIONAIS)).max(20).optional(),
});

const acessoSchema = z.strictObject({
  id: z.uuid(),
  modules: z.array(z.enum(MODULOS_OPCIONAIS)).max(20),
});

const SO_A_VENDEDORA = "Só a vendedora tem módulos.";
const ERRO_AO_SALVAR = "Não foi possível salvar o acesso.";

/** Mesmas frases que o PR 3 já devolve para e-mail e papel; as outras são deste PR. */
function erroDoConvite(error: z.ZodError): string {
  const campo = error.issues[0]?.path[0];
  if (campo === "email") return "E-mail invalido.";
  if (campo === "role") return "Função inválida.";
  if (campo === "modules") return "Módulo desconhecido.";
  return "Pedido inválido.";
}

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const { data, error } = await getSupabaseAdmin()
      .from("memberships")
      .select("id, user_id, role, modules, invited_email, accepted_at, created_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data ?? []);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao listar membros." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const parsed = conviteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: erroDoConvite(parsed.error) }, { status: 400 });
    }
    const invitedEmail = normalizeEmail(parsed.data.email);
    const role = parseInviteRole(parsed.data.role);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invitedEmail)) {
      return Response.json({ error: "E-mail invalido." }, { status: 400 });
    }

    // Papel desconhecido virava `operator` em silêncio (spec acesso-vendedora §3):
    // a tela da vendedora chegando antes do backend criaria um operador.
    if (!role) {
      return Response.json({ error: "Função inválida." }, { status: 400 });
    }

    // Módulo é acesso da vendedora. Em admin/operador não teria efeito nenhum, e o
    // banco recusaria (`memberships_modules_validos`) com um 500 cru.
    if (parsed.data.modules !== undefined && role !== "seller") {
      return Response.json({ error: SO_A_VENDEDORA }, { status: 400 });
    }
    const modules = parseModulos(parsed.data.modules ?? []);

    await assertPlanLimit(ctx.tenantId, "team_members:invite");

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("memberships")
      .select("id, accepted_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("invited_email", invitedEmail)
      .maybeSingle();

    if (existing) {
      return Response.json({ error: "Este e-mail ja possui convite ou membership neste tenant." }, { status: 409 });
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("email", invitedEmail)
      .maybeSingle();

    if (existingUser) {
      return Response.json({ error: "Este e-mail ja e membro deste tenant." }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("memberships")
      .insert({
        tenant_id: ctx.tenantId,
        user_id: null,
        role,
        modules,
        invited_by: ctx.authUserId,
        invited_email: invitedEmail,
        accepted_at: null,
      })
      .select("id, role, modules, invited_email, accepted_at, created_at")
      .single();

    if (error) {
      // O pre-check acima nao protege contra corrida: entre o select e o insert
      // cabe outro POST. Quem decide de fato e o indice parcial
      // memberships_tenant_invited_email_pending_unique, e a violacao dele e a
      // mesma situacao do 409 acima — nao um erro interno com texto cru do banco.
      if (error.code === "23505") {
        return Response.json({ error: "Este e-mail ja possui convite ou membership neste tenant." }, { status: 409 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: "membership.invited",
      message: `Convite criado para ${invitedEmail}.`,
      metadata: { membership_id: data.id, role, modules },
    });

    // Avisa o convidado depois de responder. O convite ja existe no banco e vale
    // por si — segurar o 201 ate o Resend responder deixava a tela do lojista
    // travada por mais de 10s quando o provedor demorava.
    //
    // `after()` e nao fire-and-forget solto: promise solta pode ser descartada
    // quando a resposta fecha a invocacao, e ai nem o e-mail sai nem o
    // resultado entra em public.logs. O `after()` mantem a invocacao viva.
    after(async () => {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", ctx.tenantId)
        .maybeSingle();

      const { data: inviter } = await supabase
        .from("users")
        .select("name")
        .eq("tenant_id", ctx.tenantId)
        .eq("auth_user_id", ctx.authUserId)
        .maybeSingle();

      const { subject, html } = inviteEmail(
        inviter?.name ?? "Um colega",
        org?.name ?? "sua equipe",
        getAppUrl(),
        String(data.id),
      );

      await sendEmail({
        to: invitedEmail,
        subject,
        html,
        tenantId: ctx.tenantId,
        kind: "invite",
      });
    });

    return Response.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao convidar membro." }, { status: 500 });
  }
}

/**
 * Troca os módulos da vendedora: `PATCH /api/members` com `{ id, modules }`.
 *
 * Vale na próxima chamada dela: o guard do `getTenantContext` lê `modules` a cada
 * requisição, sem cache. Só para `seller` — os outros papéis não têm módulo, e
 * trocar o papel de alguém está fora da v1 (spec do acesso da vendedora).
 */
export async function PATCH(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const parsed = acessoSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });

    const { id } = parsed.data;
    const modules = parseModulos(parsed.data.modules);
    const supabase = getSupabaseAdmin();

    const { data: alvo, error: alvoErro } = await supabase
      .from("memberships")
      .select("id, user_id, role, modules, invited_email")
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (alvoErro) {
      console.error("[api/members] PATCH: falha lendo o membro:", alvoErro);
      return Response.json({ error: ERRO_AO_SALVAR }, { status: 500 });
    }
    if (!alvo) return Response.json({ error: "Membro não encontrado." }, { status: 404 });
    if (alvo.role !== "seller") return Response.json({ error: SO_A_VENDEDORA }, { status: 400 });

    // Tenant e papel de novo na escrita: entre a leitura e o update o membro pode
    // ter sido removido — aí nada casa e a resposta é 404, não um 200 que mente.
    const { data: salvo, error } = await supabase
      .from("memberships")
      .update({ modules })
      .eq("id", id)
      .eq("tenant_id", ctx.tenantId)
      .eq("role", "seller")
      .select("id, modules")
      .maybeSingle();

    if (error) {
      console.error("[api/members] PATCH: falha gravando o acesso:", error);
      return Response.json({ error: ERRO_AO_SALVAR }, { status: 500 });
    }
    if (!salvo) return Response.json({ error: "Membro não encontrado." }, { status: 404 });

    const quem = alvo.invited_email ?? alvo.user_id ?? id;
    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: "membership.modules_changed",
      message: `Acesso de ${quem} alterado.`,
      metadata: {
        membership_id: id,
        role: "seller",
        modules_before: parseModulos(alvo.modules),
        modules_after: modules,
      },
    });

    return Response.json({ id: salvo.id, modules: parseModulos(salvo.modules) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao salvar o acesso." }, { status: 500 });
  }
}

/**
 * Remove um membro ou revoga um convite pendente.
 *
 * `DELETE /api/members?id=<membership_id>`
 *
 * Toda query filtra `tenant_id` do contexto: o cliente é service-role e
 * bypassa RLS, então esse filtro é o que impede alcançar membership de outro
 * tenant passando um id adivinhado.
 */
export async function DELETE(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertBillingRole(ctx);

    const membershipId = new URL(req.url).searchParams.get("id")?.trim();
    if (!membershipId) {
      return Response.json({ error: "Parametro id obrigatorio." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: target, error: targetError } = await supabase
      .from("memberships")
      .select("id, user_id, role, invited_email, accepted_at")
      .eq("id", membershipId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (targetError) return Response.json({ error: targetError.message }, { status: 500 });
    if (!target) return Response.json({ error: "Membro nao encontrado." }, { status: 404 });

    // Owners ATIVOS (convite aceito). Um convite de owner pendente não segura o
    // tenant, então não deve bloquear a remoção do último owner de verdade.
    const { count: ownerCount, error: countError } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenantId)
      .eq("role", "owner")
      .not("user_id", "is", null)
      .not("accepted_at", "is", null);

    if (countError) return Response.json({ error: countError.message }, { status: 500 });

    const decision = canRemoveMember({
      actor: { role: ctx.role, authUserId: ctx.authUserId },
      target: { role: target.role as TenantRole, userId: target.user_id },
      ownerCount: ownerCount ?? 0,
    });

    if (!decision.allowed) {
      return Response.json({ error: decision.message }, { status: decision.status });
    }

    const { error: deleteError } = await supabase
      .from("memberships")
      .delete()
      .eq("id", membershipId)
      .eq("tenant_id", ctx.tenantId);

    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

    // O perfil em `users` só sai junto quando o convite já tinha sido aceito;
    // convite pendente nunca criou perfil.
    if (target.user_id) {
      await supabase
        .from("users")
        .delete()
        .eq("tenant_id", ctx.tenantId)
        .eq("auth_user_id", target.user_id);
    }

    const alvo = target.invited_email ?? target.user_id ?? membershipId;
    await supabase.from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "info",
      event: target.accepted_at ? "membership.removed" : "membership.invite_revoked",
      message: target.accepted_at ? `Membro ${alvo} removido.` : `Convite de ${alvo} revogado.`,
      metadata: { membership_id: membershipId, role: target.role },
    });

    return Response.json({ removed: true, id: membershipId });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao remover membro." }, { status: 500 });
  }
}
