import { after } from "next/server";
import { tratarEvento, type Ambiente } from "@/lib/ig/engine/handle-event";
import { linkDoConvite, novoRef } from "@/lib/ig/engine/link";
import { zernioApiKey, zernioWebhookSecret } from "@/lib/ig/segredos";
import { assinaturaConfere } from "@/lib/ig/transport/signature";
import { createZernioTransport } from "@/lib/ig/transport/zernio";
import { lerEvento } from "@/lib/ig/webhook/events";
import { getAccountByProviderId, setAccountStatus } from "@/lib/stores/ig-accounts";
import { listLiveFlows } from "@/lib/stores/ig-flows";
import { claimWaitingRun, countRunsStartedSince, createRun, getRunBySourceId, getWaitingRun, hasRecentRun, purgeOldRuns, recordStep, updateRun } from "@/lib/stores/ig-runs";
import { getTenantSettings } from "@/lib/stores/tenant-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETENCAO_DIAS = 90;

function ambiente(): Ambiente {
  return {
    transport: createZernioTransport({ apiKey: zernioApiKey() }),
    now: () => new Date(),
    novoRef,
    contaPorIdDaZernio: getAccountByProviderId,
    mudarEstadoDaConta: setAccountStatus,
    lojaLiberada: async (tenantId) => (await getTenantSettings(tenantId)).instagramEnabled,
    fluxosNoAr: listLiveFlows,
    runs: { criar: createRun, porOrigem: getRunBySourceId, atualizar: updateRun, passo: recordStep, iniciadosDesde: countRunsStartedSince, entradaRecente: hasRecentRun, esperando: getWaitingRun, reivindicar: claimWaitingRun },
    link: linkDoConvite,
  };
}

// POST /api/ig/webhook — sem sessão (PROVIDER_WEBHOOKS). Assinatura do corpo cru em
// tempo constante; evento em zod; 202 para tudo que não é nosso (o endpoint não
// vira oráculo); 500 só quando vale a Zernio reenviar.
export async function POST(req: Request) {
  const cru = await req.text();
  if (!assinaturaConfere(cru, req.headers.get("x-zernio-signature"), zernioWebhookSecret())) return new Response("Assinatura inválida.", { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(cru);
  } catch {
    return new Response("Corpo inválido.", { status: 400 });
  }
  const ev = lerEvento(json);
  if (!ev) return new Response(null, { status: 202 });

  const desfecho = await tratarEvento(ev, ambiente());
  if (desfecho.kind === "retry") return new Response("Tente de novo.", { status: 500 });
  if (desfecho.kind === "handled") {
    const { tenantId } = desfecho;
    // ponytail: retenção de 90 dias sem cron — uma limpeza por atendimento novo, depois da resposta.
    after(() => purgeOldRuns(tenantId, new Date(Date.now() - RETENCAO_DIAS * 86_400_000).toISOString()).catch(() => {}));
    return Response.json({ runId: desfecho.runId, status: desfecho.status });
  }
  return new Response(null, { status: 202 });
}
