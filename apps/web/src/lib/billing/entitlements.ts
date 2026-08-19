import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { hasReachedLimit, resolveLimitCheck, type Limits, type PlanCapability } from "./capability-limits";

export type { Limits, PlanCapability } from "./capability-limits";
export { CAPABILITY_LIMIT_KEY, CAPABILITY_TABLE } from "./capability-limits";

export async function getTenantLimits(tenantId: string): Promise<Limits> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, plans(limits)")
    .eq("tenant_id", tenantId)
    .in("status", ["free", "trialing", "active"])
    .maybeSingle();

  if (error || !data) return {};

  const plan = data.plans as { limits?: Limits } | null;
  return plan?.limits ?? {};
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
