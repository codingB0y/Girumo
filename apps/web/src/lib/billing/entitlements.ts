import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  hasReachedLimit,
  resolveLimitCheck,
  tenantLimitsFrom,
  type Limits,
  type PlanCapability,
  extrasFromMetadata,
} from "./capability-limits";
import { planBlockedBody, planLimitBody, planStorageFullBody } from "./plan-limit-error";
import { subscriptionAccess } from "./subscription-access";

export type { Limits, PlanCapability } from "./capability-limits";
export { CAPABILITY_LIMIT_KEY, CAPABILITY_TABLE } from "./capability-limits";

/**
 * Teto do tenant. Nunca devolve `{}` por ausencia de assinatura.
 *
 * O defeito original: `if (error || !data) return {}` fundia dois casos
 * diferentes e dava o mesmo desfecho para os dois — e `{}` faz
 * `resolveLimitCheck` responder `allow` para tudo. Quem nao assinava ficava com
 * teto MAIOR que qualquer cliente pagante.
 *
 * Os dois casos seguem separados, e agora com um terceiro desfecho:
 *
 * - **sem linha** e um FATO: nao ha assinatura. Ate 27/08/2026 isso valia o teto
 *   do plano FREE; com a decisao paid-first vale BLOQUEIO (`BLOCKED_LIMITS`).
 * - **erro de leitura** e um DESCONHECIDO: nao da para saber qual e o plano, e
 *   adivinhar em caminho de cobranca e como o defeito nasceu. Sobe 500.
 *
 * A consulta ao plano FREE do catalogo que existia aqui foi REMOVIDA junto. Ela
 * era o que fazia "sem assinatura" aterrissar no gratuito, e mante-la depois de
 * tirar o FREE do catalogo seria pior que inutil: a leitura passaria a falhar
 * em silencio e o teto viria do fallback embutido — o FREE ressuscitado em
 * codigo, com instancia de WhatsApp liberada. De quebra, some uma consulta ao
 * banco de todo caminho de escrita do painel.
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
      // O teto efetivo e catalogo + extras da assinatura: `plans.limits` e
      // global, entao o add-on comprado por um tenant nao pode morar la.
      return tenantLimitsFrom({
        subscription: {
          limits: plan?.limits ?? null,
          extras: extrasFromMetadata(data.metadata),
        },
      });
    }
  }

  // Sem assinatura, ou com assinatura que nao concede (cancelada, inadimplente,
  // pendente vencida): bloqueio. A saida do cliente e o 402, que a tela de
  // assinatura ja trata — nao um plano gratuito silencioso.
  return tenantLimitsFrom({ subscription: null });
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
