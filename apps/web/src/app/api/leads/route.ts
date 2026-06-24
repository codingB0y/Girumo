import { listLeads, addLead, updateLeadStatus, removeLead, type LeadStatus } from "@/lib/leads-store";
import { isOptedOut } from "@/lib/optout-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: LeadStatus[] = ["novo", "ativo", "comprou"];

// GET /api/leads — lista leads reais (capturados pela engine ao entrar no grupo).
export async function GET() {
  return Response.json(await listLeads());
}

// POST /api/leads — ingestão de uma entrada de grupo detectada pela engine.
// Body: { phone, sourceGroup, name?, sourceCampaign? }
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  // phone pode vir vazio quando a engine ainda não resolveu o LID→telefone real.
  const phone = String(body.phone ?? "").trim();
  const sourceGroup = String(body.sourceGroup ?? "").trim();
  if (!sourceGroup) {
    return Response.json({ error: "sourceGroup é obrigatório." }, { status: 400 });
  }

  // LGPD: quem pediu descadastro não é capturado como lead.
  if (phone && (await isOptedOut(phone))) {
    return Response.json({ skipped: "opt-out" }, { status: 200 });
  }

  const lead = await addLead({
    phone,
    sourceGroup,
    sourceGroupId: body.sourceGroupId ? String(body.sourceGroupId) : undefined,
    name: body.name ? String(body.name) : undefined,
    sourceCampaign: body.sourceCampaign ? String(body.sourceCampaign) : undefined,
  });
  return Response.json(lead, { status: 201 });
}

// PATCH /api/leads — muda o status do lead (novo/ativo/comprou). Body { id, status }
export async function PATCH(req: Request) {
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
  const lead = await updateLeadStatus(id, status);
  if (!lead) return Response.json({ error: "Lead não encontrado." }, { status: 404 });
  return Response.json(lead);
}

// DELETE /api/leads?id= — exclusão por id (LGPD: direito de eliminação).
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id obrigatório." }, { status: 400 });
  const ok = await removeLead(id);
  return Response.json({ ok });
}
