import { randomBytes } from "node:crypto";
import { normalizeHostname } from "@/lib/custom-domains/hostname";
import { shouldRemoveFromVercel } from "@/lib/custom-domains/removal";
import { removeProjectDomain, vercelConfigured } from "@/lib/custom-domains/vercel";
import { toDominioView } from "@/lib/custom-domains/view";
import { assertPermission } from "@/lib/permissions";
import {
  claimCustomDomain,
  deleteCustomDomain,
  getActiveDomainTenant,
  getCustomDomain,
} from "@/lib/stores/custom-domains";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function indisponivel(): Response {
  return Response.json({ error: "Domínio próprio ainda não está disponível." }, { status: 503 });
}

function erroInterno(acao: string, error: unknown): Response {
  if (error instanceof Response) return error;
  console.error(`[api/dominio] ${acao}`, error);
  return Response.json({ error: "Erro ao processar o domínio." }, { status: 500 });
}

// GET /api/dominio — estado do domínio da conta. `habilitado: false` esconde o cartão.
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    if (!USE_SUPABASE || !vercelConfigured()) return Response.json({ habilitado: false, dominio: null });
    const domain = await getCustomDomain(ctx.tenantId);
    return Response.json({ habilitado: true, dominio: domain ? toDominioView(domain) : null });
  } catch (error) {
    return erroInterno("GET", error);
  }
}

// POST /api/dominio { hostname } — cadastra pendente, com token de posse novo.
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "settings:connection");
    if (!USE_SUPABASE || !vercelConfigured()) return indisponivel();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }
    const raw = (body as { hostname?: unknown } | null)?.hostname;
    const check = normalizeHostname(typeof raw === "string" ? raw : "");
    if (!check.ok) return Response.json({ error: check.error }, { status: 400 });

    const claim = await claimCustomDomain(ctx.tenantId, check.hostname, randomBytes(16).toString("hex"));
    if (!claim.ok) {
      return Response.json({ error: "Sua conta já tem um domínio. Remova o atual para trocar." }, { status: 409 });
    }
    return Response.json({ dominio: toDominioView(claim.domain) }, { status: 201 });
  } catch (error) {
    return erroInterno("POST", error);
  }
}

// DELETE /api/dominio — tira do projeto Vercel e apaga a linha.
export async function DELETE(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "settings:connection");
    if (!USE_SUPABASE) return indisponivel();

    const domain = await getCustomDomain(ctx.tenantId);
    if (!domain) return new Response(null, { status: 204 });
    if (vercelConfigured()) {
      const dono = await getActiveDomainTenant(domain.hostname);
      if (shouldRemoveFromVercel(domain, dono, ctx.tenantId)) {
        // Falha aqui não segura a remoção: host no projeto sem linha no banco
        // responde 404 em tudo, e um novo cadastro ainda precisa provar posse.
        await removeProjectDomain(domain.hostname).catch((err) =>
          console.error(`[api/dominio] remover ${domain.hostname} da Vercel`, err),
        );
      }
    }
    await deleteCustomDomain(ctx.tenantId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return erroInterno("DELETE", error);
  }
}
