import {
  listOptOut as legacyList,
  addOptOut as legacyAdd,
  removeOptOut as legacyRemove,
} from "@/lib/optout-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import * as supaOptouts from "@/lib/stores/optouts";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** O painel consome a forma do store JSON antigo (`date`, não `created_at`). */
function toLegacyShape(item: supaOptouts.OptOut) {
  return {
    id: item.id,
    phone: item.phone,
    reason: item.reason ?? "",
    date: item.created_at,
  };
}

export async function GET(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  if (!USE_SUPABASE) return Response.json(await legacyList(tenantId));
  const items = await supaOptouts.listOptOuts(tenantId);
  return Response.json(items.map(toLegacyShape));
}

// DELETE /api/optout?id= — remove um número da lista de descadastro.
export async function DELETE(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  if (!USE_SUPABASE) {
    await legacyRemove(tenantId, id);
    return Response.json({ ok: true });
  }
  return Response.json({ ok: await supaOptouts.removeOptOut(tenantId, id) });
}

export async function POST(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const phone = String(body.phone ?? "").trim();
  if (!phone) return Response.json({ error: "phone obrigatório." }, { status: 400 });
  const reason = String(body.reason ?? "");

  if (!USE_SUPABASE) {
    return Response.json(await legacyAdd(tenantId, phone, reason), { status: 201 });
  }
  return Response.json(toLegacyShape(await supaOptouts.addOptOut(tenantId, phone, reason)), {
    status: 201,
  });
}
