// Status da etiqueta do Melhor Envio -> marco do rastreio. Puro: sem I/O.

export type EtiquetaMelhorEnvio = {
  tracking: string | null;
  status: string;
  criadaEm: string | null;
  atualizadaEm: string | null;
  entregueEm: string | null;
};

export type MarcoDoMelhorEnvio = { etapa: "entregue" | "problema"; em: string; statusRaw: string };

/** Tira todo espaço e sobe a caixa; vazio ou não-texto vira null. */
export function normalizarCodigo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const limpo = v.replace(/\s+/g, "").toUpperCase();
  return limpo === "" ? null : limpo;
}

// statusRaw precisa passar na CHECK da RPC.
const STATUS_VALIDO = /^[a-z_]{1,30}$/;

// `suspended` fica de fora de propósito: é da etiqueta, não da entrega (spec §1.1).
export function marcoDaEtiqueta(e: EtiquetaMelhorEnvio, agora: Date): MarcoDoMelhorEnvio | null {
  if (!STATUS_VALIDO.test(e.status)) return null;
  const statusRaw = `melhorenvio:${e.status}`;
  if (e.status === "delivered") {
    return { etapa: "entregue", em: e.entregueEm ?? e.atualizadaEm ?? agora.toISOString(), statusRaw };
  }
  if (e.status === "undelivered" || e.status === "paused") {
    return { etapa: "problema", em: e.atualizadaEm ?? agora.toISOString(), statusRaw };
  }
  return null;
}
