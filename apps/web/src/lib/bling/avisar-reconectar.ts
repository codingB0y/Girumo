import "server-only";

import { sendEmail } from "@/lib/email/send";
import { blingReconectarEmail } from "@/lib/email/templates";
import { getAppUrl } from "@/lib/environment";
import { marcarAlertaReconectar } from "@/lib/stores/bling-conexoes";
import { desmarcarAlertaReconectar } from "@/lib/stores/bling-conexoes-alertas";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * E-mail aos donos quando o Bling recusa o acesso da loja (spec §3 "Token"): uma vez por queda —
 * `marcarAlertaReconectar` só devolve true na primeira, e a reconexão zera o alerta. Se nenhum
 * e-mail sai, a marca volta e o cron reenvia; sem dono com e-mail legível, reenviar não adianta.
 *
 * Nunca lança: quem chama está parando a loja, e o cartão já mostra o alerta vermelho. Log sem
 * endereço de e-mail (`sendEmail` registra a entrega em public.logs com o endereço mascarado).
 */

export type Dono = { email: string; nome: string };

export type DepsDoAviso = {
  marcarAlerta: (tenantId: string) => Promise<boolean>;
  desmarcarAlerta: (tenantId: string) => Promise<void>;
  donos: (tenantId: string) => Promise<Dono[]>;
  enviar: typeof sendEmail;
  appUrl: () => string;
};

const ROTULO = "[bling/avisar-reconectar]";

export async function avisarReconectar(tenantId: string, deps: DepsDoAviso = depsDoAviso()): Promise<void> {
  try {
    if (!(await deps.marcarAlerta(tenantId))) return;
    if (await algumEmailSaiu(tenantId, deps)) return;
    await deps.desmarcarAlerta(tenantId);
    console.error(`${ROTULO} loja ${tenantId}: nenhum e-mail saiu; o alerta volta e o cron tenta de novo`);
  } catch (e) {
    console.error(`${ROTULO} loja ${tenantId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** false = nenhum saiu (donos que não carregam também). Sem dono com e-mail legível, true: reenviar não adianta. */
async function algumEmailSaiu(tenantId: string, deps: DepsDoAviso): Promise<boolean> {
  let donos: Dono[];
  try {
    donos = await deps.donos(tenantId);
  } catch (e) {
    console.error(`${ROTULO} loja ${tenantId}: donos: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
  if (donos.length === 0) {
    console.warn(`${ROTULO} loja ${tenantId}: nenhum dono com e-mail legível; o alerta fica marcado`);
    return true;
  }
  let saiu = false;
  for (const dono of donos) if (await avisarDono(tenantId, dono, deps)) saiu = true;
  return saiu;
}

/** true = saiu. O que explode conta como não saiu: os outros donos ainda recebem. */
async function avisarDono(tenantId: string, dono: Dono, deps: DepsDoAviso): Promise<boolean> {
  const { subject, html } = blingReconectarEmail(dono.nome, deps.appUrl());
  try {
    if (await deps.enviar({ to: dono.email, subject, html, tenantId, kind: "bling_reconectar" })) return true;
    console.warn(`${ROTULO} loja ${tenantId}: um e-mail não saiu (o motivo está em public.logs)`);
  } catch (e) {
    console.warn(`${ROTULO} loja ${tenantId}: um e-mail não saiu: ${e instanceof Error ? e.message : String(e)}`);
  }
  return false;
}

function depsDoAviso(): DepsDoAviso {
  return {
    marcarAlerta: marcarAlertaReconectar,
    desmarcarAlerta: desmarcarAlertaReconectar,
    donos: donosDaLoja,
    enviar: sendEmail,
    appUrl: getAppUrl,
  };
}

/** Donos com convite aceito; quem não tem e-mail legível fica de fora sem derrubar os outros. */
async function donosDaLoja(tenantId: string): Promise<Dono[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .not("accepted_at", "is", null);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as Array<{ user_id: string | null }>).flatMap((m) => (m.user_id ? [m.user_id] : []));
  const donos = await Promise.all(ids.map((id) => donoPorId(tenantId, id)));
  return donos.flatMap((dono) => (dono ? [dono] : []));
}

/**
 * Erro do Auth (fora do ar, 503) é passageiro: sobe, os donos não carregam e o alerta volta para o cron
 * reenviar. Só o e-mail ausente é definitivo (a membership some com o usuário, então ele existe).
 */
async function donoPorId(tenantId: string, userId: string): Promise<Dono | null> {
  const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId);
  if (error) throw new Error(`Auth: ${error.message}`);
  const email = data.user?.email;
  if (!email) {
    console.warn(`[bling/avisar-reconectar] loja ${tenantId}: dono sem e-mail legível no Auth`);
    return null;
  }
  const nome: unknown = data.user?.user_metadata?.name;
  return { email, nome: typeof nome === "string" && nome.trim() ? nome.trim() : "lojista" };
}
