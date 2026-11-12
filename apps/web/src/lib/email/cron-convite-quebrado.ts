import "server-only";
import { createHash } from "node:crypto";
import {
  JANELA_DO_AVISO_MS,
  TIPO_CONVITE_QUEBRADO,
  conviteQuebradoDaCampanha,
  listaDeGrupos,
  type ConviteQuebrado,
} from "@/lib/email/convite-quebrado-aviso";
import type { ContextoDoJob } from "@/lib/email/cron-link-parado";
import { sendEmail } from "@/lib/email/send";
import { conviteQuebradoEmail } from "@/lib/email/templates";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";

type Supabase = ContextoDoJob["supabase"];

const PAGINA = 1000;

/**
 * `whatsapp_group_id` → nome dos grupos da loja com convite quebrado. Pagina: sem
 * `.range()` o PostgREST corta em 1000 linhas sem erro. Erro lança.
 */
async function gruposQuebradosDaLoja(supabase: Supabase, tenantId: string): Promise<Map<string, string>> {
  const quebrados = new Map<string, string>();
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("groups")
      .select("whatsapp_group_id, name")
      .eq("tenant_id", tenantId)
      .eq("invite_check", "broken")
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as Array<{ whatsapp_group_id: string | null; name: string | null }>;
    for (const g of pagina) {
      if (g.whatsapp_group_id) quebrados.set(g.whatsapp_group_id, g.name?.trim() || "Grupo sem nome");
    }
    if (pagina.length < PAGINA) return quebrados;
  }
}

/** Campanhas da loja com grupo quebrado. Loja sem grupo quebrado nem lê as campanhas. */
async function convitesQuebradosDaLoja(supabase: Supabase, tenantId: string, now: Date): Promise<ConviteQuebrado[]> {
  const quebrados = await gruposQuebradosDaLoja(supabase, tenantId);
  if (quebrados.size === 0) return [];
  return (await listCampaignGroups(tenantId)).flatMap((campanha) => {
    const aviso = conviteQuebradoDaCampanha(campanha, quebrados, now);
    return aviso ? [aviso] : [];
  });
}

/** As campanhas ainda não avisadas na janela. Erro no dedupe não manda (é o `liberado`). */
async function semAvisoNaJanela(ctx: ContextoDoJob, tenantId: string, avisos: ConviteQuebrado[]): Promise<ConviteQuebrado[]> {
  const desde = new Date(ctx.now.getTime() - JANELA_DO_AVISO_MS).toISOString();
  const pendentes: ConviteQuebrado[] = [];
  for (const aviso of avisos) {
    const avisado = await ctx.supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("type", TIPO_CONVITE_QUEBRADO)
      .eq("href", aviso.href)
      .gte("created_at", desde)
      .limit(1);
    if (ctx.liberado(TIPO_CONVITE_QUEBRADO, tenantId, avisado)) pendentes.push(aviso);
  }
  return pendentes;
}

/** Manda o e-mail ao dono e grava um aviso por campanha. Devolve os erros contados. */
async function avisarDono(ctx: ContextoDoJob, tenantId: string, pendentes: ConviteQuebrado[]): Promise<{ enviado: boolean; erros: number }> {
  const { supabase } = ctx;
  const { data: owner, error: ownerError } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .maybeSingle();
  if (ownerError) {
    // Dois donos também caem aqui (`maybeSingle`): sem log, o aviso nunca chegaria e ninguém veria.
    console.error(`[cron] convite_quebrado: falha lendo o dono de ${tenantId}:`, ownerError.message);
    return { enviado: false, erros: 1 };
  }
  if (!owner) return { enviado: false, erros: 0 };

  const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id);
  const email = userData.user?.email;
  if (!email) return { enviado: false, erros: 0 };

  const tpl = conviteQuebradoEmail(userData.user?.user_metadata?.name || "lojista", ctx.appUrl, pendentes);
  // Mesma loja, mesmo dia, mesmas campanhas = mesma chave: se o insert do dedupe
  // falhar lá embaixo, o reenvio da rodada seguinte morre no Resend (janela de 24 h).
  const campanhasDoEnvio = createHash("sha256").update(pendentes.map((p) => p.href).join("\n")).digest("hex").slice(0, 16);
  const sent = await sendEmail({
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    tenantId,
    kind: "convite_quebrado",
    idempotencyKey: `convite-quebrado/${tenantId}/${ctx.todayStartISO.slice(0, 10)}/${campanhasDoEnvio}`,
  });
  if (!sent) return { enviado: false, erros: 1 };

  const { error } = await supabase.from("notifications").insert(
    pendentes.map((p) => ({
      tenant_id: tenantId,
      user_id: owner.user_id,
      type: TIPO_CONVITE_QUEBRADO,
      title: `Convite quebrado na campanha "${p.nome}"`,
      body: `O WhatsApp não deixou ler o convite de ${listaDeGrupos(p.grupos)}. Confira o grupo e aperte "Revisar agora" em Revisar links.`,
      href: p.href,
    })),
  );
  if (error) {
    // O e-mail já foi: conta erro (o reenvio fica com a idempotencyKey).
    console.error(`[cron] convite_quebrado: enviado para ${tenantId} mas notification não registrada:`, error.message);
    return { enviado: true, erros: 1 };
  }
  return { enviado: true, erros: 0 };
}

/**
 * Job 9 do cron de e-mails: campanha (não encerrada) com grupo cujo convite a última
 * revisão marcou como quebrado. Um e-mail por loja com todas as campanhas pendentes;
 * uma notificação por campanha, que é o dedupe (no máximo 1 aviso por campanha por
 * semana).
 *
 * Só usa o veredito já gravado em `groups.invite_check`: nenhuma consulta ao WhatsApp
 * sai daqui. Sem opt-out próprio, pelo mesmo motivo do Job 8.
 */
export async function avisarConvitesQuebrados(ctx: ContextoDoJob): Promise<{ enviados: number; erros: number }> {
  let enviados = 0;
  let erros = 0;

  const { data: orgs, error: orgsError } = await ctx.supabase.from("organizations").select("id, name");
  if (orgsError) {
    console.error("[cron] convite_quebrado: falha lendo organizations:", orgsError.message);
    return { enviados, erros: 1 };
  }

  for (const org of orgs ?? []) {
    if (!(await ctx.temPlanoValendo(org.id))) continue;

    let avisos: ConviteQuebrado[];
    try {
      avisos = await convitesQuebradosDaLoja(ctx.supabase, org.id, ctx.now);
    } catch (e) {
      console.error(`[cron] convite_quebrado: falha lendo grupos/campanhas de ${org.id}:`, (e as Error).message);
      erros++;
      continue;
    }
    if (avisos.length === 0) continue;

    const pendentes = await semAvisoNaJanela(ctx, org.id, avisos);
    if (pendentes.length === 0) continue;

    const r = await avisarDono(ctx, org.id, pendentes);
    if (r.enviado) enviados++;
    erros += r.erros;
  }

  return { enviados, erros };
}
