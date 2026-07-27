import { evolutionEventId } from "@/lib/evolution/event-id";
import { secretMatches } from "@/lib/evolution/webhook-secret";
import {
  mapConnectionState,
  parseEvolutionWebhook,
  phoneFromWuid,
  stripCredentials,
  type EvolutionWebhookEvent,
} from "@/lib/evolution/webhook-schema";
import { resolveSecret } from "@/lib/runtime-secrets";
import {
  findByProviderInstanceId,
  recordEngineEvent,
  updateInstanceStatus,
  type Instance,
} from "@/lib/stores/instances";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Receiver dos webhooks da Evolution API.
 *
 * Ordem deliberada: autentica → valida → resolve instância → só então escreve.
 * Nada acontece antes do secret conferir, para que um atacante não consiga usar
 * o endpoint nem como oráculo (descobrir instâncias) nem como gerador de carga
 * no banco.
 *
 * Idempotência não é tratada aqui: o `event_id` determinístico + o UNIQUE em
 * `engine_events` fazem a reentrega virar no-op no próprio Postgres.
 */

// nodejs (não edge): timingSafeEqual é do módulo crypto do Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET_HEADER = "x-evolution-webhook-secret";

/** QR: só o status/código na instância. O código NUNCA entra em engine_events. */
async function applyQrCode(instance: Instance, event: EvolutionWebhookEvent): Promise<void> {
  if (event.event !== "qrcode.updated") return;

  await updateInstanceStatus({
    tenantId: instance.tenant_id,
    instanceId: instance.id,
    status: "qr",
    qrCode: event.data.qrcode.code,
  });

  // Observabilidade sem credencial: registra que houve QR, nunca qual.
  await getSupabaseAdmin().from("logs").insert({
    tenant_id: instance.tenant_id,
    level: "info",
    event: "evolution.qr.updated",
    message: "Novo QR de pareamento emitido.",
    metadata: { instance_id: instance.id },
  });
}

async function applyConnectionUpdate(
  instance: Instance,
  event: EvolutionWebhookEvent,
): Promise<void> {
  if (event.event !== "connection.update") return;

  const status = mapConnectionState(event.data.state);
  // Estado desconhecido (versão futura): o evento fica registrado, mas o status
  // da instância não é adivinhado.
  if (!status) return;

  await updateInstanceStatus({
    tenantId: instance.tenant_id,
    instanceId: instance.id,
    status,
    phone: phoneFromWuid(event.data.wuid),
  });
}

export async function POST(req: Request) {
  const expectedSecret = resolveSecret(
    "EVOLUTION_WEBHOOK_SECRET",
    process.env.EVOLUTION_WEBHOOK_SECRET,
    process.env.NODE_ENV,
    "dev-evolution-webhook-secret",
  );

  if (!secretMatches(req.headers.get(SECRET_HEADER), expectedSecret)) {
    // 401 sem corpo descritivo e sem nenhum side effect.
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = parseEvolutionWebhook(raw);
  if (!parsed.ok) {
    // `parsed.error` é só caminho + motivo, nunca o payload (contém apikey).
    return Response.json({ error: "invalid payload", detail: parsed.error }, { status: 400 });
  }

  const event = parsed.event;

  const instance = await findByProviderInstanceId(event.instance);
  if (!instance) {
    // 202, não 404: responder diferente por instância existente/inexistente
    // transformaria o endpoint num oráculo de enumeração. A Evolution também
    // não deve reentregar um evento que nunca teremos como associar.
    return Response.json({ received: true, ignored: true }, { status: 202 });
  }

  if (event.event === "qrcode.updated") {
    await applyQrCode(instance, event);
    return Response.json({ received: true });
  }

  if (event.event === "connection.update") {
    await applyConnectionUpdate(instance, event);
  }

  // Demais eventos (e connection.update, que também vira trilha) vão para a
  // fila de eventos, consumida pelo worker nas F3/F4.
  //
  // Persiste o payload CRU menos a credencial, não o objeto do zod: o schema
  // descarta chaves de topo desconhecidas, e é exatamente essa diferença que
  // documentaria uma mudança de contrato entre versões da Evolution.
  await recordEngineEvent({
    tenantId: instance.tenant_id,
    instanceId: instance.id,
    type: event.event,
    payload: stripCredentials(raw as Record<string, unknown>),
    eventId: evolutionEventId(event),
  });

  return Response.json({ received: true });
}
