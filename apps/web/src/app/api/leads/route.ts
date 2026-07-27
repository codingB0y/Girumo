import {
  listLeads as legacyList,
  addLead as legacyAdd,
  updateLeadStatus as legacyUpdate,
  removeLead as legacyRemove,
  type LeadStatus,
} from "@/lib/leads-store";
import { isOptedOut as legacyIsOptedOut } from "@/lib/optout-store";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import * as supaLeads from "@/lib/stores/leads";
import * as supaOptouts from "@/lib/stores/optouts";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: LeadStatus[] = ["novo", "ativo", "comprou"];

/**
 * O painel consome a forma camelCase do store JSON antigo. Mapear aqui mantém
 * as telas intactas na troca de backend — mesmo padrão de `/api/groups`.
 */
function toLegacyShape(lead: supaLeads.Lead) {
  return {
    id: lead.id,
    name: lead.name ?? "Novo membro",
    phone: lead.phone ?? "",
    sourceGroup: lead.source_group_name ?? "",
    sourceGroupId: lead.source_group_id ?? undefined,
    sourceCampaign: lead.source_campaign ?? "—",
    status: lead.status,
    enteredAt: lead.entered_at,
    lastSeenAt: lead.last_seen_at ?? undefined,
    alsoIn: lead.also_in ?? [],
  };
}

function isOptedOut(tenantId: string, phone: string): Promise<boolean> {
  return USE_SUPABASE
    ? supaOptouts.isOptedOut(tenantId, phone)
    : legacyIsOptedOut(tenantId, phone);
}

// GET /api/leads — lista leads reais (capturados ao entrar no grupo).
export async function GET(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  if (!USE_SUPABASE) return Response.json(await legacyList(tenantId));
  const leads = await supaLeads.listLeads(tenantId);
  return Response.json(leads.map(toLegacyShape));
}

// POST /api/leads — ingestão de uma entrada de grupo.
// Body: { phone, sourceGroup, name?, sourceGroupId?, sourceCampaign? }
export async function POST(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: true });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  // phone pode vir vazio: participante `@lid` sem telefone real resolvido.
  // Vira lead mesmo assim — a entrada no grupo é o fato, e inventar número
  // seria pior do que não ter.
  const phone = String(body.phone ?? "").trim();
  const sourceGroup = String(body.sourceGroup ?? "").trim();
  if (!sourceGroup) {
    return Response.json({ error: "sourceGroup é obrigatório." }, { status: 400 });
  }

  // LGPD: quem pediu descadastro não é capturado como lead — nem registro.
  if (phone && (await isOptedOut(tenantId, phone))) {
    return Response.json({ skipped: "opt-out" }, { status: 200 });
  }

  const input = {
    phone,
    sourceGroup,
    sourceGroupId: body.sourceGroupId ? String(body.sourceGroupId) : undefined,
    name: body.name ? String(body.name) : undefined,
    sourceCampaign: body.sourceCampaign ? String(body.sourceCampaign) : undefined,
  };

  if (!USE_SUPABASE) {
    return Response.json(await legacyAdd(tenantId, input), { status: 201 });
  }
  return Response.json(toLegacyShape(await supaLeads.addLead(tenantId, input)), { status: 201 });
}

// PATCH /api/leads — muda o status do lead (novo/ativo/comprou). Body { id, status }
export async function PATCH(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const id = String(body.id ?? "");
  const status = body.status as LeadStatus;
  if (!id || !VALID.includes(status)) {
    return Response.json({ error: "id e status válidos são obrigatórios." }, { status: 400 });
  }

  if (!USE_SUPABASE) {
    const legacy = await legacyUpdate(tenantId, id, status);
    if (!legacy) return Response.json({ error: "Lead não encontrado." }, { status: 404 });
    return Response.json(legacy);
  }

  const lead = await supaLeads.updateLeadStatus(tenantId, id, status);
  if (!lead) return Response.json({ error: "Lead não encontrado." }, { status: 404 });
  return Response.json(toLegacyShape(lead));
}

// DELETE /api/leads?id= — exclusão por id (LGPD: direito de eliminação).
export async function DELETE(req: Request) {
  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  const ok = USE_SUPABASE
    ? await supaLeads.removeLead(tenantId, id)
    : await legacyRemove(tenantId, id);
  return Response.json({ ok });
}
