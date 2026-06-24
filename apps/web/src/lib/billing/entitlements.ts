import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type PlanCapability =
  | "instances:create"
  | "contacts:create"
  | "campaigns:create"
  | "campaigns:send"
  | "funnels:create"
  | "uploads:create"
  | "team_members:invite";

type Limits = {
  whatsapp_instances?: number;
  contacts?: number;
  campaigns?: number;
  funnels?: number;
  uploads_mb?: number;
  team_members?: number;
};

const CAPABILITY_LIMIT_KEY: Record<PlanCapability, keyof Limits> = {
  "instances:create": "whatsapp_instances",
  "contacts:create": "contacts",
  "campaigns:create": "campaigns",
  "campaigns:send": "campaigns",
  "funnels:create": "funnels",
  "uploads:create": "uploads_mb",
  "team_members:invite": "team_members",
};

const CAPABILITY_TABLE: Partial<Record<PlanCapability, string>> = {
  "instances:create": "instances",
  "contacts:create": "contacts",
  "campaigns:create": "campaigns",
  "campaigns:send": "campaigns",
  "funnels:create": "funnels",
  "team_members:invite": "memberships",
};

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
  const limitKey = CAPABILITY_LIMIT_KEY[capability];
  const limit = limits[limitKey];

  if (limit === undefined || limit === null) return;
  if (limit < 0) return;

  const table = CAPABILITY_TABLE[capability];
  if (!table) {
    if (limit <= 0) throw new Response("Recurso bloqueado pelo plano atual.", { status: 402 });
    return;
  }

  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) throw new Response("Nao foi possivel validar limites do plano.", { status: 500 });
  if ((count ?? 0) >= limit) {
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
