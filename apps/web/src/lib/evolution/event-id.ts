import { createHash } from "node:crypto";

import type { EvolutionWebhookEvent } from "./webhook-schema";

/**
 * Namespace fixo do Girumo para eventos da Evolution API.
 *
 * NUNCA mudar: o event_id derivado dele é a chave UNIQUE que torna o receiver
 * replay-safe (`engine_events.event_id`). Trocar o namespace faria todo evento
 * já processado voltar a ser considerado novo.
 */
const EVOLUTION_EVENT_NAMESPACE = "15e94cae-d353-42d8-b046-624193e9cc7c";

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * UUID v5 (RFC 4122, §4.3) — SHA-1 sobre namespace + nome.
 *
 * Implementado à mão de propósito: o repo não tem lib de uuid e o único uso é
 * este. Node 20+ traz `randomUUID` (v4), que é aleatório e portanto inútil aqui
 * — precisamos que o MESMO payload gere sempre o MESMO id.
 */
export function uuidV5(name: string, namespace: string = EVOLUTION_EVENT_NAMESPACE): string {
  const hash = createHash("sha1").update(uuidToBytes(namespace)).update(name, "utf8").digest();

  // Version 5 (0101) no nibble alto do byte 6; variant RFC 4122 (10x) no byte 8.
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  return bytesToUuid(hash);
}

function sortedJoin(values: readonly string[]): string {
  return [...values].sort().join(",");
}

/**
 * Chave natural de cada evento — o que define "é o mesmo evento".
 *
 * A Evolution não manda id de evento, então derivamos um a partir dos campos
 * que identificam o fato. Reentrega do mesmo payload cai no mesmo id e o
 * `on conflict (event_id)` do RPC `record_engine_event` transforma o INSERT em
 * no-op idempotente.
 */
function eventName(event: EvolutionWebhookEvent): string {
  switch (event.event) {
    case "qrcode.updated":
      // Não persistido em engine_events (o code é credencial de pareamento),
      // mas o id existe para logging correlacionável.
      return `${event.instance}|qrcode.updated|${event.date_time}`;

    case "connection.update":
      return `${event.instance}|connection.update|${event.data.state}|${event.date_time}`;

    case "group-participants.update": {
      const participants = sortedJoin(event.data.participants.map((p) => p.id));
      return `${event.instance}|group-participants.update|${event.data.id}|${event.data.action}|${participants}|${event.date_time}`;
    }

    case "groups.upsert": {
      const groups = sortedJoin(event.data.map((g) => g.id));
      return `${event.instance}|groups.upsert|${groups}|${event.date_time}`;
    }

    case "messages.update":
      // Sem date_time: a transição de status de uma mensagem é única e estável.
      // Incluir o timestamp faria a mesma transição reentregue virar evento novo.
      return `${event.instance}|messages.update|${event.data.keyId}|${event.data.status}`;

    case "messages.upsert":
      // Sem date_time, pela mesma razão: a mensagem é única e estável. Aqui o
      // custo de errar é maior — cada reentrega considerada nova seria a mesma
      // cliente entrando duas vezes na fila da promoção.
      return `${event.instance}|messages.upsert|${event.data.key.id}`;
  }
}

/** Id determinístico de um evento da Evolution, para uso como `engine_events.event_id`. */
export function evolutionEventId(event: EvolutionWebhookEvent): string {
  return uuidV5(eventName(event));
}
