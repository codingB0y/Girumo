import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/** Um aviso de pedido cabe com folga; acima disso a rota responde 413 sem ler. */
export const LIMITE_CORPO_AVISO = 64 * 1024;

const PREFIXO = "sha256=";
const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * "sha256=<hex>" = HMAC-SHA256 do corpo cru com o client secret. Tempo constante.
 * A rota passa os BYTES (`arrayBuffer()`) e só decodifica depois de conferir: decodificar antes
 * tira o BOM e troca byte UTF-8 inválido por U+FFFD, e a assinatura de um corpo legítimo não bate.
 */
export function assinaturaBlingConfere(corpo: Uint8Array | string, cabecalho: string | null, segredo: string): boolean {
  if (!cabecalho || !segredo) return false;
  const valor = cabecalho.trim().toLowerCase();
  if (!valor.startsWith(PREFIXO)) return false;
  const hex = valor.slice(PREFIXO.length);
  if (!HEX_64.test(hex)) return false;
  const hmac = createHmac("sha256", segredo);
  const esperada = (typeof corpo === "string" ? hmac.update(corpo, "utf8") : hmac.update(corpo)).digest();
  const dada = Buffer.from(hex, "hex");
  return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}

export type EventoPedido = "order.created" | "order.updated" | "order.deleted";
export type AvisoBling = { eventoId: string; evento: EventoPedido; empresaId: string; pedidoId: number };

const texto = z.string().min(1).max(200);

// Só o que o motor usa: o estado do pedido vem depois por GET, não do aviso.
const envelope = z.object({ eventId: texto, event: z.string(), companyId: texto, data: z.unknown() });
const eventoDePedido = z.enum(["order.created", "order.updated", "order.deleted"]);

// O Bling manda o id como número; string de dígitos é tolerada. Acima do inteiro seguro o número perde precisão.
const idDoPedido = z
  .union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
  .refine((id) => Number.isSafeInteger(id) && id > 0);
const dadosDoPedido = z.object({ id: idDoPedido });

/**
 * Recurso que não é pedido de venda (produto, estoque, nota…) é `outro_evento` antes de olhar `data`,
 * que tem outro formato. A rota responde 200 nos dois casos: a assinatura já provou que é o Bling, e
 * 4xx repetido faz o Bling desligar o webhook de todas as lojas.
 */
export function lerAviso(json: unknown): { ok: true; aviso: AvisoBling } | { ok: false; motivo: "outro_evento" | "formato" } {
  const env = envelope.safeParse(json);
  if (!env.success) return { ok: false, motivo: "formato" };
  const evento = eventoDePedido.safeParse(env.data.event);
  if (!evento.success) return { ok: false, motivo: "outro_evento" };
  const dados = dadosDoPedido.safeParse(env.data.data);
  if (!dados.success) return { ok: false, motivo: "formato" };
  return {
    ok: true,
    aviso: { eventoId: env.data.eventId, evento: evento.data, empresaId: env.data.companyId, pedidoId: dados.data.id },
  };
}
