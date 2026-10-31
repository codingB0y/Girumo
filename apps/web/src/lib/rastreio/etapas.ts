/** Status da Yampi → etapa do Rastreio (spec §1.1). Puro. */
import type { Etapa } from "@/lib/rastreio/tipos";

const ETAPA_DO_STATUS = new Map<string, Etapa>([
  ["waiting_payment", "aguardando_pagamento"],
  ["authorized", "aguardando_pagamento"],
  ["created", "aguardando_pagamento"],
  ["paid", "confirmado"],
  ["handling_products", "separando"],
  ["invoiced", "separando"],
  ["ready_for_shipping", "separando"],
  ["on_carriage", "separando"], // vira "enviado" só com código de rastreio
  ["ready_for_pickup", "retirada"],
  ["shipment_exception", "problema"],
  ["delivered", "entregue"],
  ["refused", "cancelado"],
  ["cancelled", "cancelado"],
]);

export function etapaDaYampi(e: { statusAlias: string | null; trackCode: string | null; delivered: boolean }): Etapa | null {
  const base = e.statusAlias === null ? undefined : ETAPA_DO_STATUS.get(e.statusAlias);
  if (base === "cancelado") return base;
  if (e.delivered) return "entregue";
  if (base === undefined) {
    console.warn(`[rastreio] status da Yampi desconhecido: ${e.statusAlias}`); // só o alias
    return null;
  }
  if ((base === "confirmado" || base === "separando") && e.trackCode?.trim()) return "enviado";
  return base;
}
