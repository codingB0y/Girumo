import { evolutionWebhookUrl, providerInstanceId, setWebhook } from "@/lib/evolution/client";
import { resolveSecret } from "@/lib/runtime-secrets";
import { listInstances } from "@/lib/stores/instances";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-registra o webhook das instâncias que já existem.
 *
 * `setWebhook` só era chamado na criação, então acrescentar um evento à
 * constante não alcançava instância antiga: ela seguia assinada na lista do dia
 * em que foi criada. Sem isto, `messages.upsert` nunca chega e a Oferta
 * Relâmpago fica muda parecendo bug de código.
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getTenantContext(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return Response.json({ error: "sem permissao" }, { status: 403 });
  }

  const secret = resolveSecret(
    "EVOLUTION_WEBHOOK_SECRET",
    process.env.EVOLUTION_WEBHOOK_SECRET,
    process.env.NODE_ENV,
    "dev-evolution-webhook-secret",
  );

  const resultados: Array<{ id: string; ok: boolean; erro?: string }> = [];

  for (const instancia of await listInstances(ctx.tenantId)) {
    try {
      await setWebhook(providerInstanceId(instancia.id), evolutionWebhookUrl(), secret);
      resultados.push({ id: instancia.id, ok: true });
    } catch (e) {
      resultados.push({
        id: instancia.id,
        ok: false,
        erro: e instanceof Error ? e.message : "falhou",
      });
    }
  }

  return Response.json({ resultados });
}
