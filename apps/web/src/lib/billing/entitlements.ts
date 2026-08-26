import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  hasReachedLimit,
  resolveLimitCheck,
  tenantLimitsFrom,
  type Limits,
  type PlanCapability,
} from "./capability-limits";
import { FREE_PLAN_CODE } from "./plan-codes";
import { planBlockedBody, planLimitBody, planStorageFullBody } from "./plan-limit-error";
import { subscriptionAccess } from "./subscription-access";

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
  // Sem filtro de status na query, de proposito: a decisao de quais estados
  // concedem o plano mora em `subscriptionAccess`, junto do motivo. Enquanto o
  // filtro vivia aqui (`in [free, trialing, active]`), quem emitia boleto caia
  // no FREE em silencio — `unpaid` ficava de fora, e ninguem lendo esta linha
  // percebia que "unpaid" tambem significa "acabou de pagar". `subscriptions`
  // tem unique(tenant_id), entao `maybeSingle` continua valendo.
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, metadata, current_period_end, plans(limits)")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Response("Nao foi possivel validar limites do plano.", { status: 500 });

  if (data) {
    const acesso = subscriptionAccess(
      {
        status: data.status,
        stripeStatus:
          (data.metadata as { stripe_status?: string | null } | null)?.stripe_status ?? null,
        periodEnd: data.current_period_end,
      },
      new Date(),
    );

    if (acesso.grantsPlan) {
      const plan = data.plans as { limits?: Limits | null } | null;
      return tenantLimitsFrom({ subscription: { limits: plan?.limits ?? null }, freePlan: null });
    }
  }

  // `plans` é catálogo global (ver o comentário em api/plans/route.ts): filtrar
  // por tenant aqui devolveria vazio.
  //
  // `ilike` e não `eq` porque o mesmo plano é escrito de dois jeitos no repo:
  // produção e `auth/signup` usam "FREE", enquanto `admin/seed` grava "free" e
  // `admin/tenants/create` procura "free". Casar exato faz a leitura falhar
  // calada num ambiente semeado e aplicar o fallback achando que leu o catálogo.
  const { data: free, error: freeError } = await supabase
    .from("plans")
    .select("limits")
    .ilike("code", FREE_PLAN_CODE)
    .maybeSingle();

  // Aqui o fallback É a resposta certa (conservador), então não sobe 500 como o
  // erro de `subscriptions` acima. Mas o erro não pode sumir: sem log, uma
  // indisponibilidade do catálogo aplicaria os números embutidos por tempo
  // indeterminado sem deixar rastro nenhum em edge_logs.
  if (freeError) {
    console.error("[billing] falha ao ler o plano FREE do catalogo:", freeError);
  }

  return tenantLimitsFrom({ subscription: null, freePlan: (free?.limits as Limits | null) ?? null });
}

export async function assertPlanLimit(tenantId: string, capability: PlanCapability): Promise<void> {
  const limits = await getTenantLimits(tenantId);
  const check = resolveLimitCheck(capability, limits);

  if (check.kind === "allow") return;
  if (check.kind === "block") {
    throw Response.json(planBlockedBody(capability), { status: 402 });
  }

  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from(check.table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) throw new Response("Nao foi possivel validar limites do plano.", { status: 500 });
  if (hasReachedLimit(count ?? 0, check.limit)) {
    // `planLimitBody` e nao `planLimitReachedBody`: teto zero chega AQUI, pelo
    // caminho de contagem, e nao pelo `block` acima — `resolveLimitCheck` so
    // responde `block` para capability sem tabela. Chamar o construtor de
    // "limite atingido" direto produzia "voce ja usou as 0 campanhas".
    throw Response.json(planLimitBody(capability, check.limit), { status: 402 });
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
    throw Response.json(planStorageFullBody(uploadsMb), { status: 402 });
  }
}
