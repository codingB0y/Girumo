import "server-only";
import { ENGINE_TOKEN } from "@/lib/auth";
import type { ModuloOpcional } from "@/lib/auth/modulos";
import { getEngineTenantId } from "@/lib/engine-context";
import type { TenantRole } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export type RouteTenantContext = {
  tenantId: string;
  actor: "engine" | "user";
  role: TenantRole | null;
  /** Quem chamou. `null` quando é a engine. */
  authUserId: string | null;
  /** Módulos opcionais da membership (só `seller` tem). Engine: []. */
  modules: ModuloOpcional[];
};

export async function getRouteTenantContext(
  req: Request,
  options: { allowEngine: boolean },
): Promise<RouteTenantContext> {
  const engineToken = req.headers.get("x-engine-token");
  if (engineToken) {
    if (!options.allowEngine) {
      throw new Response("Rota não permitida para a engine.", { status: 403 });
    }
    if (ENGINE_TOKEN === "" || engineToken !== ENGINE_TOKEN) {
      throw new Response("Token da engine inválido.", { status: 401 });
    }

    let tenantId: string;
    try {
      tenantId = getEngineTenantId(req);
    } catch {
      throw new Response("Tenant da engine ausente ou inválido.", { status: 400 });
    }

    const { data: organization } = await getSupabaseAdmin()
      .from("organizations")
      .select("id, status")
      .eq("id", tenantId)
      .maybeSingle();

    if (!organization || (organization.status && organization.status !== "active")) {
      throw new Response("Tenant da engine não encontrado ou inativo.", { status: 403 });
    }

    return { tenantId, actor: "engine", role: null, authUserId: null, modules: [] };
  }

  const user = await getTenantContext(req);
  return {
    tenantId: user.tenantId,
    actor: "user",
    role: user.role,
    authUserId: user.authUserId,
    modules: user.modules,
  };
}
