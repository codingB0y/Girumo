import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encerrarLoja } from "@/lib/billing/encerrar-loja";
import { getStripe } from "@/lib/billing/stripe";
import { getTenantContext, type TenantContext } from "@/lib/supabase/tenant-context";
import { createSupabaseAnonClient, getSupabaseAdmin } from "@/lib/supabase/server";
import { assertPermission } from "@/lib/permissions";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth";
import {
  MENSAGEM_DE_LIMITE,
  mensagemDaNovaSenha,
  mensagemDoNovoEmail,
  tipoDaFalhaDeLogin,
} from "@/lib/auth/erros-do-auth";
import { revokeSessions } from "@/lib/auth/session-revocation-store";
import { MINIMO_DA_SENHA, MINIMO_DO_NOME } from "@/lib/painel/conta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type PedidoDaConta = { name?: string; email?: string; password?: string; currentPassword: string };

/**
 * A conta entra só pelo Google (nenhuma identidade de e-mail/senha)?
 *
 * Só orienta a tela: quem nunca criou senha não tem como conferir a senha
 * atual, e o caminho é "Esqueci a senha", que prova a posse da caixa de e-mail.
 */
async function entraSoPeloGoogle(authUserId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin().auth.admin.getUserById(authUserId);
  const identidades = data.user?.identities ?? [];
  return identidades.length > 0 && !identidades.some((i) => i.provider === "email");
}

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const supabase = getSupabaseAdmin();

    const [{ data: user }, soGoogle] = await Promise.all([
      supabase
        .from("users")
        .select("name, email")
        .eq("auth_user_id", ctx.authUserId)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle(),
      entraSoPeloGoogle(ctx.authUserId),
    ]);

    return NextResponse.json({
      name: user?.name ?? "",
      email: ctx.email ?? user?.email ?? "",
      role: ctx.role,
      tenantId: ctx.tenantId,
      soGoogle,
    });
  } catch {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
}

/** Lê e valida o corpo antes de qualquer chamada ao Auth. */
async function lerPedido(req: Request): Promise<PedidoDaConta | NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON inválido." }, { status: 400 });

  const name = body.name === undefined ? undefined : String(body.name).trim();
  const email = body.email === undefined ? undefined : String(body.email).trim().toLowerCase();
  const password = body.password === undefined ? undefined : String(body.password);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";

  if (name !== undefined && name.length < MINIMO_DO_NOME) {
    return NextResponse.json({ error: "Nome precisa ter pelo menos 2 caracteres." }, { status: 400 });
  }
  if (email !== undefined && !EMAIL_VALIDO.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (password !== undefined && password.length < MINIMO_DA_SENHA) {
    return NextResponse.json({ error: "Senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
  }
  if ((email !== undefined || password !== undefined) && !currentPassword) {
    return NextResponse.json({ error: "Informe a senha atual para trocar o e-mail ou a senha." }, { status: 400 });
  }
  return { name, email, password, currentPassword };
}

/**
 * Confere a senha atual abrindo uma sessão num cliente anon descartável — e
 * devolve esse cliente, porque a troca é feita por ele.
 *
 * Trocar pela API de admin (como era) aplicava o e-mail novo na hora, sem link
 * de confirmação, e não pedia prova nenhuma: quem pegasse uma sessão aberta
 * tomava a conta. O `updateUser` do próprio usuário passa pela "troca segura de
 * e-mail" do Supabase. O cliente é novo por request: o singleton anon guardaria
 * esta sessão e a próxima requisição trocaria a credencial da conta errada.
 */
async function conferirSenhaAtual(ctx: TenantContext, senha: string): Promise<SupabaseClient | NextResponse> {
  if (!ctx.email) {
    return NextResponse.json({ error: "Não foi possível conferir a senha atual." }, { status: 400 });
  }
  const sessao = createSupabaseAnonClient();
  // O e-mail é o DA SESSÃO, nunca um vindo do corpo.
  const { error } = await sessao.auth.signInWithPassword({ email: ctx.email, password: senha });
  if (!error) return sessao;

  const tipo = tipoDaFalhaDeLogin(error);
  if (tipo === "limite") return NextResponse.json({ error: MENSAGEM_DE_LIMITE }, { status: 429 });
  if (tipo === "indisponivel") {
    console.error("[account] conferir senha: Supabase Auth falhou:", error.status, error.code ?? error.message);
    return NextResponse.json(
      { error: "Não foi possível conferir a senha agora. Tente de novo em instantes." },
      { status: 503 },
    );
  }
  const mensagem = (await entraSoPeloGoogle(ctx.authUserId))
    ? "Senha atual incorreta. Sua conta entra pelo Google: se você nunca criou uma senha, crie uma em “Esqueci a senha”."
    : "Senha atual incorreta.";
  return NextResponse.json({ error: mensagem }, { status: 403 });
}

/**
 * Senha trocada: quem estava com a conta aberta em outro aparelho cai.
 *
 * O GoTrue já encerra as outras sessões do Supabase ao trocar a senha; o que
 * sobrevivia era o cookie `dz_session` (30 dias). O corte em
 * `session_revocations` derruba todos, e este aparelho ganha um cookie novo,
 * emitido depois do corte.
 */
async function respostaDaSenhaTrocada(authUserId: string, extra: Record<string, unknown>): Promise<NextResponse> {
  try {
    await revokeSessions(authUserId);
  } catch (error) {
    // Mesmo trato do logout: a senha já mudou e não há como desfazer; o erro fica no log.
    console.error("[account] senha trocada, mas a revogação das sessões falhou:", error);
  }
  const res = NextResponse.json({ ok: true, ...extra });
  res.cookies.set(SESSION_COOKIE, await signSession(authUserId), sessionCookieOptions);
  return res;
}

async function aplicarMudancas(ctx: TenantContext, pedido: PedidoDaConta, sessao: SupabaseClient | null) {
  if (pedido.name !== undefined) {
    const { error } = await getSupabaseAdmin()
      .from("users")
      .update({ name: pedido.name })
      .eq("auth_user_id", ctx.authUserId)
      .eq("tenant_id", ctx.tenantId);
    if (error) return NextResponse.json({ error: "Erro ao atualizar nome." }, { status: 500 });
  }

  const extra: Record<string, unknown> = {};
  if (pedido.email !== undefined && sessao) {
    const { data, error } = await sessao.auth.updateUser({ email: pedido.email });
    if (error) {
      return NextResponse.json({ error: mensagemDoNovoEmail(error) }, { status: error.status === 429 ? 429 : 400 });
    }
    // Com a troca segura ligada, o endereço novo fica em `new_email` até o link ser clicado.
    extra.emailPendente = Boolean(data.user?.new_email);
  }

  if (pedido.password !== undefined && sessao) {
    const { error } = await sessao.auth.updateUser({ password: pedido.password });
    if (error) {
      return NextResponse.json({ error: mensagemDaNovaSenha(error) }, { status: error.status === 429 ? 429 : 400 });
    }
    return respostaDaSenhaTrocada(ctx.authUserId, extra);
  }

  return NextResponse.json({ ok: true, ...extra });
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "settings:account");

    const pedido = await lerPedido(req);
    if (pedido instanceof NextResponse) return pedido;

    const trocaCredencial = pedido.email !== undefined || pedido.password !== undefined;
    let sessao: SupabaseClient | null = null;
    if (trocaCredencial) {
      const conferida = await conferirSenhaAtual(ctx, pedido.currentPassword);
      if (conferida instanceof NextResponse) return conferida;
      sessao = conferida;
    }

    let senhaTrocada = false;
    try {
      const res = await aplicarMudancas(ctx, pedido, sessao);
      senhaTrocada = pedido.password !== undefined && res.ok;
      return res;
    } finally {
      // A sessão aberta só para conferir a senha não fica viva. Com a senha
      // trocada, `global` também derruba qualquer refresh token que sobrou;
      // sem troca de senha, `local` encerra só ela e este aparelho segue logado.
      await sessao?.auth.signOut({ scope: senhaTrocada ? "global" : "local" });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[account] PATCH falhou:", error);
    return NextResponse.json({ error: "Erro ao salvar." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const ctx = await getTenantContext(req);
  assertPermission(ctx.role, "account:delete");

  const supabase = getSupabaseAdmin();

  // O dono some junto com o único login que gerencia a cobrança (`billing:manage`
  // é só dele): antes, a loja para de cobrar e de postar. Se isso falhar, o login
  // fica — sem ele ninguém abre o portal para cancelar.
  if (ctx.role === "owner") {
    const encerrada = await encerrarLoja({ supabase, stripe: getStripe, tenantId: ctx.tenantId });
    if (encerrada.error !== null) {
      console.error("[auth/account] encerrar loja falhou:", encerrada.error);
      return NextResponse.json(
        {
          error:
            "Não conseguimos cancelar sua assinatura agora, então a conta não foi apagada. Tente de novo em alguns minutos ou fale com o suporte.",
        },
        { status: 502 },
      );
    }
  }

  // Apaga o login; memberships e users caem junto pela FK. A organização e os
  // dados da loja ficam.
  const { error } = await supabase.auth.admin.deleteUser(ctx.authUserId);
  if (error) {
    return NextResponse.json({ error: "Erro ao deletar conta." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
