import { getTenantContext } from "@/lib/supabase/tenant-context";
import { assertPermission } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { vincularGrupo, desvincularGrupo, listarComunidades } from "@/lib/stores/communities";
import { COMUNIDADE_NATIVA_MENSAGEM, validarWhatsappGroupId } from "@/lib/communities/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMUNIDADE_NAO_ENCONTRADA = "não encontrada";

/**
 * A gaveta espelha uma comunidade nativa? Se sim, recusa a escrita: quem
 * manda em `group_ids` é o próximo sync, e um POST/DELETE direto aqui
 * dessincroniza a gaveta do WhatsApp até lá. Botão desabilitado na tela é
 * aparência — esta é a barreira real (spec, Task 6 Step 2).
 */
async function recusarSeNativa(tenantId: string, slug: string): Promise<Response | null> {
  const alvo = (await listarComunidades(tenantId)).find((c) => c.slug === slug);
  if (!alvo?.whatsappCommunityJid) return null;
  return Response.json({ error: COMUNIDADE_NATIVA_MENSAGEM }, { status: 409 });
}

/**
 * O grupo pertence ao tenant?
 *
 * Sem isso, um `whatsappGroupId` forjado no corpo vincularia grupo de OUTRO
 * tenant à comunidade deste — o service-role bypassa RLS, então esta query
 * (filtrada por tenant_id) é a única barreira real. `desvincularGrupo` não
 * precisa do mesmo check: ela só tira um id do array `group_ids` da própria
 * comunidade do tenant (já filtrada por tenant_id em `buscarPorSlug`), nunca
 * toca dado de outro tenant — remover um id forjado (presente ou não no
 * array) é no-op inofensivo.
 */
async function grupoPertenceAoTenant(tenantId: string, whatsappGroupId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("groups")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("whatsapp_group_id", whatsappGroupId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

async function lerWhatsappGroupId(req: Request): Promise<{ ok: true; whatsappGroupId: string } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: Response.json({ error: "JSON inválido." }, { status: 400 }) };
  }
  const validado = validarWhatsappGroupId(body);
  if (!validado.ok) {
    return { ok: false, response: Response.json({ error: validado.error }, { status: 400 }) };
  }
  return { ok: true, whatsappGroupId: validado.whatsappGroupId };
}

/** POST /api/comunidades/[slug]/grupos — body { whatsappGroupId } */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "campaign:edit");

    const recusa = await recusarSeNativa(ctx.tenantId, slug);
    if (recusa) return recusa;

    const lido = await lerWhatsappGroupId(req);
    if (!lido.ok) return lido.response;

    const pertence = await grupoPertenceAoTenant(ctx.tenantId, lido.whatsappGroupId);
    if (!pertence) {
      return Response.json({ error: "Grupo não encontrado." }, { status: 404 });
    }

    await vincularGrupo(ctx.tenantId, slug, lido.whatsappGroupId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Error && error.message.includes(COMUNIDADE_NAO_ENCONTRADA)) {
      return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });
    }
    console.error("[api/comunidades/grupos] falha ao vincular:", error);
    return Response.json({ error: "Erro ao vincular o grupo." }, { status: 500 });
  }
}

/** DELETE /api/comunidades/[slug]/grupos — body { whatsappGroupId } */
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "campaign:edit");

    const recusa = await recusarSeNativa(ctx.tenantId, slug);
    if (recusa) return recusa;

    const lido = await lerWhatsappGroupId(req);
    if (!lido.ok) return lido.response;

    await desvincularGrupo(ctx.tenantId, slug, lido.whatsappGroupId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Error && error.message.includes(COMUNIDADE_NAO_ENCONTRADA)) {
      return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });
    }
    console.error("[api/comunidades/grupos] falha ao desvincular:", error);
    return Response.json({ error: "Erro ao desvincular o grupo." }, { status: 500 });
  }
}
