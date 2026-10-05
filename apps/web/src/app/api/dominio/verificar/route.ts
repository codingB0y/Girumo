import { vercelConfigured } from "@/lib/custom-domains/vercel";
import { verifyCustomDomain } from "@/lib/custom-domains/verify";
import { toDominioView } from "@/lib/custom-domains/view";
import { assertPermission } from "@/lib/permissions";
import { getCustomDomain, saveVerification } from "@/lib/stores/custom-domains";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pior caso: várias chamadas encadeadas de até 10s à Vercel, mais o DNS.
export const maxDuration = 60;

const NAO_ENCONTRADO = "Nenhum domínio cadastrado.";

// POST /api/dominio/verificar — TXT de posse → Vercel → DNS. Só promove:
// domínio ativo não é reverificado (TXT apagado depois não derruba links no ar).
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    assertPermission(ctx.role, "settings:connection");
    if (!USE_SUPABASE || !vercelConfigured()) {
      return Response.json({ error: "Domínio próprio ainda não está disponível." }, { status: 503 });
    }

    const domain = await getCustomDomain(ctx.tenantId);
    if (!domain) return Response.json({ error: NAO_ENCONTRADO }, { status: 404 });
    if (domain.status === "active") return Response.json({ dominio: toDominioView(domain), desafios: [] });

    const outcome = await verifyCustomDomain(domain.hostname, domain.verificationToken);
    let saved = await saveVerification(
      ctx.tenantId,
      outcome.active ? { status: "active", lastError: null } : { status: "pending", lastError: outcome.problem },
    );
    // Outra conta já ativou este host (posse provada lá também): fica pendente.
    if (!saved.ok && saved.reason === "taken") {
      saved = await saveVerification(ctx.tenantId, { status: "pending", lastError: "em-uso" });
    }
    if (!saved.ok) {
      // `gone`: a linha sumiu ou já não está pendente (outra verificação ativou
      // antes). Devolve o estado atual em vez de erro.
      const atual = await getCustomDomain(ctx.tenantId);
      if (!atual) return Response.json({ error: NAO_ENCONTRADO }, { status: 404 });
      return Response.json({ dominio: toDominioView(atual), desafios: [] });
    }

    return Response.json({
      dominio: toDominioView(saved.domain),
      desafios: outcome.active ? [] : outcome.challenges,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/dominio/verificar]", error);
    return Response.json({ error: "Erro ao verificar o domínio." }, { status: 500 });
  }
}
