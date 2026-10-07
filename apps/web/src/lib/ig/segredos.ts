import "server-only";

import { resolveSecret } from "@/lib/runtime-secrets";

/** Vazia = Zernio não configurada; o transporte recusa antes de sair pedido. */
export function zernioApiKey(): string {
  return process.env.ZERNIO_API_KEY?.trim() ?? "";
}

/** Assina o webhook da Zernio (ela também tem este segredo). Em produção, obrigatória. */
export function zernioWebhookSecret(): string {
  return resolveSecret("ZERNIO_WEBHOOK_SECRET", process.env.ZERNIO_WEBHOOK_SECRET, process.env.NODE_ENV, "dev-zernio-webhook-secret");
}

/**
 * Assina o `state` da conexão. NÃO é o segredo do webhook: a Zernio conhece
 * aquele e poderia forjar um `state`. Reaproveita o AUTH_SECRET, como o
 * pages/render-context; o domínio dentro do HMAC (connect/state) separa os usos.
 */
export function connectStateSecret(): string {
  return resolveSecret("AUTH_SECRET", process.env.AUTH_SECRET, process.env.NODE_ENV, "dz-dev-secret-troque-em-producao");
}
