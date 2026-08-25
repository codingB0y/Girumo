import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  hasReachedLimit,
  limitesDoTenant,
  resolveLimitCheck,
  type Limits,
  type PlanCapability,
} from "./capability-limits";

export type { Limits, PlanCapability } from "./capability-limits";
export { CAPABILITY_LIMIT_KEY, CAPABILITY_TABLE } from "./capability-limits";

/**
 * Teto do tenant. Nunca devolve `{}` por ausencia de assinatura.
 *
 * O defeito que isto corrige: `if (error || !data) return {}` fundia dois casos
 * diferentes e dava o mesmo desfecho para os dois — e `{}` faz
 * `resolveLimitCheck` responder `allow` para tudo. Quem nao assinava ficava com
 * teto MAIOR que qualquer cliente pagante.
 *
 * Agora os dois casos sao separados:
 *
 * - **sem linha** e um FATO: nao ha assinatura, entao vale o teto do FREE;
 * - **erro de leitura** e um DESCONHECIDO: nao da para saber qual e o plano, e
 *   adivinhar em caminho de cobranca e como o defeito nasceu. Sobe 500.
 */
export async function getTenantLimits(tenantId: string): Promise<Limits> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, plans(limits)")
    .eq("tenant_id", tenantId)
    .in("status", ["free", "trialing", "active"])
    .maybeSingle();

  if (error) throw new Response("Nao foi possivel validar limites do plano.", { status: 500 });

  if (data) {
    const plan = data.plans as { limits?: Limits | null } | null;
    return limitesDoTenant({ assinatura: { limits: plan?.limits ?? null }, planoFree: null });
  }

  // `plans` e catalogo global (ver o comentario em api/plans/route.ts): filtrar
  // por tenant aqui devolveria vazio.
  const { data: free } = await supabase
    .from("plans")
    .select("limits")
    .eq("code", "FREE")
    .maybeSingle();

  return limitesDoTenant({ assinatura: null, planoFree: (free?.limits as Limits | null) ?? null });
}

export async function assertPlanLimit(tenantId: string, capability: PlanCapability): Promise<void> {
  const limits = await getTenantLimits(tenantId);
  const check = resolveLimitCheck(capability, limits);

  if (check.kind === "allow") return;
  if (check.kind === "block") {
    throw new Response("Recurso bloqueado pelo plano atual.", { status: 402 });
  }

  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from(check.table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) throw new Response("Nao foi possivel validar limites do plano.", { status: 500 });
  if (hasReachedLimit(count ?? 0, check.limit)) {
    throw new Response("Limite do plano atingido.", { status: 402 });
  }
}

export async function assertUploadLimit(tenantId: string, nextBytes: number): Promise<void> {
  const limits = await getTenantLimits(tenantId);
  const uploadsMb = limits.uploads_mb;

  if (uploadsMb === undefined || uploadsMb === null || uploadsMb < 0) return;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("uploads").select("size").eq("tenant_id", tenantId);

  if (error) throw new Response("Nao foi possivel validar limite de upload.", { status: 500 });

  const usedBytes = (data ?? []).reduce((total, upload) => total + Number(upload.size ?? 0), 0);
  const limitBytes = uploadsMb * 1024 * 1024;

  if (usedBytes + nextBytes > limitBytes) {
    throw new Response("Limite de armazenamento do plano atingido.", { status: 402 });
  }
}
