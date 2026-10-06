import "server-only";

import { resolveSecret } from "@/lib/runtime-secrets";

/** Vazia = Zernio não configurada; o transporte recusa antes de sair pedido. */
export function zernioApiKey(): string {
  return process.env.ZERNIO_API_KEY?.trim() ?? "";
}

/** Assina o webhook da Zernio e o `state` da conexão. Em produção, obrigatória. */
export function zernioWebhookSecret(): string {
  return resolveSecret("ZERNIO_WEBHOOK_SECRET", process.env.ZERNIO_WEBHOOK_SECRET, process.env.NODE_ENV, "dev-zernio-webhook-secret");
}
