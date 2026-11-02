/** Quem recebe aviso de uma etapa nova, e por qual canal. Puro. */
import { ETAPAS_COM_AVISO, type Canal, type Etapa, type EtapaComAviso, type MatrizAvisos, type OrigemDoPedido, type PedidoGravado } from "@/lib/rastreio/tipos";

const JANELA_MS = 3 * 86_400_000; // pedido mexido há mais que isso não avisa

export function ehEtapaComAviso(etapa: Etapa): etapa is EtapaComAviso {
  return (ETAPAS_COM_AVISO as readonly string[]).includes(etapa);
}

/** A etapa mudou agora, não veio da importação e o pedido foi mexido na Yampi nos últimos 3 dias. */
export function mudancaParaAvisar(e: { gravado: PedidoGravado; origem: OrigemDoPedido; atualizadoNaYampi: string; agora: Date }): boolean {
  return e.gravado.mudou && e.origem !== "importacao" && Date.parse(e.atualizadoNaYampi) >= e.agora.getTime() - JANELA_MS; // NaN dá falso
}

export function canaisDoAviso(e: {
  gravado: PedidoGravado;
  origem: OrigemDoPedido;
  atualizadoNaYampi: string;
  agora: Date;
  matriz: MatrizAvisos;
  paradoEm: string | null;
  temTelefone: boolean;
  temEmail: boolean;
}): Canal[] {
  const etapa = e.gravado.etapa;
  if (!mudancaParaAvisar(e) || !ehEtapaComAviso(etapa) || e.paradoEm) return [];
  return (["whatsapp", "email"] as const).filter((c) => e.matriz[etapa][c] && (c === "whatsapp" ? e.temTelefone : e.temEmail));
}
