import { janela, type JanelaMeta } from "./situacao";
import type { ConversationEventRow } from "@/lib/stores/ig-conversations";

/** Regras puras das rotas das Conversas (spec §6, §7.5, §7.6). Sem banco, sem relógio próprio. */

/** Resposta pelo painel pausa o robô por este tempo (mesmo prazo do mockup: "volta sozinho depois de 12 h"). */
export const PAUSA_HORAS = 12;

export const pausaAte = (agora: Date): string => new Date(agora.getTime() + PAUSA_HORAS * 3600_000).toISOString();

/** Janela de envio da loja: aberta/humano mandam (humano com a tag); fechada (mais de 7 dias, ou sem data) recusa. */
export function decidirEnvio(lastDmAt: string | null, agora: Date): { ok: true; humanAgent: boolean } | { ok: false } {
  const j: JanelaMeta = janela(lastDmAt, agora);
  return j === "fechada" ? { ok: false } : { ok: true, humanAgent: j === "humano" };
}

export type RotuloDaBolha = { autor: "robo" | "voce"; runId: string | null };

/** Bolha nossa com evento `bot_message` = Robô; `store_message` = Você; sem evento = sem rótulo. Pelo id da mensagem. */
export function rotulosPorMensagem(eventos: ConversationEventRow[]): Map<string, RotuloDaBolha> {
  const mapa = new Map<string, RotuloDaBolha>();
  for (const e of eventos) {
    if (!e.zernio_message_id) continue;
    if (e.kind === "bot_message") mapa.set(e.zernio_message_id, { autor: "robo", runId: e.run_id });
    else if (e.kind === "store_message") mapa.set(e.zernio_message_id, { autor: "voce", runId: null });
  }
  return mapa;
}

export type MarcaDoFio = { tipo: "waiting" | "paused" | "resolved"; motivo: string | null; em: string };

/** Marcas por horário do fio: os eventos que não são mensagem. */
export function marcasDoFio(eventos: ConversationEventRow[]): MarcaDoFio[] {
  return eventos.flatMap((e) => (e.kind === "waiting" || e.kind === "paused" || e.kind === "resolved" ? [{ tipo: e.kind, motivo: e.detail, em: e.occurred_at }] : []));
}

/** Hora da mensagem mais recente DELA numa página; `null` se a página não tem nenhuma. */
export function ultimaDela(mensagens: Array<{ direction: "incoming" | "outgoing"; createdAt: string }>): string | null {
  let melhor: number | null = null;
  for (const m of mensagens) {
    const t = Date.parse(m.createdAt);
    if (m.direction === "incoming" && Number.isFinite(t) && (melhor === null || t > melhor)) melhor = t;
  }
  return melhor === null ? null : new Date(melhor).toISOString();
}

/** `mid` e `i` da rota de mídia: formato e faixa. `null` = recusa. */
export function lerAnexo(mid: string | null, i: string | null): { mid: string; indice: number } | null {
  if (!mid || !/^[\w=.+-]{1,400}$/.test(mid)) return null;
  if (i === null || !/^\d{1,2}$/.test(i)) return null;
  const indice = Number(i);
  return indice < 20 ? { mid, indice } : null;
}

/**
 * O link novo do anexo vem da Zernio e a rota responde 302 para ele: só HTTPS, sem usuário/senha e com nome
 * de host de verdade (nada de IP, `localhost` ou nome sem ponto). O host exato do CDN não é documentado
 * pela Zernio, então não há lista fechada; quando o valor real for conhecido, estreite aqui.
 */
export function linkDeAnexoSeguro(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".localhost") || h.startsWith("[") || /^\d+(\.\d+){3}$/.test(h)) return false;
  return true;
}
