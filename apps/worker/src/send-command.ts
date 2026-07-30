/**
 * Decisão de envio a partir de um comando `engine_commands` (type: send_message).
 *
 * Igual ao lead-capture: toda a regra fica aqui com o acesso a banco/HTTP
 * injetado (`SendDeps`), então é testável sem Postgres e sem Evolution. O
 * send-loop fornece as deps reais e trata claim/loop.
 *
 * CONTRATO INVIOLÁVEL (cutover): o payload de send_message é o mesmo que o
 * engine legado consumia — `{ jid, text }` (+ compat `phone` / `message` / `body`,
 * ver hubflow-engine/queues/supabase-command-worker.js). O executor de automações
 * (PR #30) grava esses comandos hoje; mudar o shape quebraria o disparo.
 *
 * O ritmo anti-ban (caps por número, espaçamento, warmup, breaker) é aplicado no
 * banco: claim_send_commands só devolve comando de número PRONTO, e este módulo
 * chama record_send/record_send_failure para atualizar esse estado. Aqui não há
 * contador em memória — é isso que torna N réplicas seguras.
 */

import { resolveMediaPath } from "./media-id.js";
import type { SendMediaInput, SendPollInput, SendTextOptions } from "./evolution-sender.js";

export type EngineCommandRow = {
  command_id: string;
  tenant_id: string;
  instance_id: string | null;
  type: string;
  payload: unknown;
};

/** Alvo já traduzido para o contrato da Evolution (`number`) + texto. */
export type SendTarget = { number: string; text: string };

export interface SendDeps {
  /** provider_instance_id (instanceName na Evolution) do número, ou null se não provisionado. */
  instanceName(instanceId: string): Promise<string | null>;
  sendText(instanceName: string, number: string, text: string, opts?: SendTextOptions): Promise<void>;
  sendMedia(instanceName: string, number: string, input: SendMediaInput): Promise<void>;
  sendPoll(instanceName: string, number: string, input: SendPollInput): Promise<void>;
  /**
   * URL assinada da mídia, gerada NA HORA DO ENVIO.
   *
   * Deliberadamente não é assinada no enfileiramento: a fila anti-ban pode segurar
   * uma mensagem por horas (cap 8/min + warmup), e uma URL assinada no enqueue
   * expiraria antes de sair. Devolve null se o objeto não existe.
   */
  signedMediaUrl(storagePath: string): Promise<string | null>;
  /** Pós-envio OK: conta a janela + estica o gate de espaçamento + warmup. */
  recordSend(instanceId: string, tenantId: string): Promise<void>;
  /** Pós-envio FALHA: alimenta o circuit breaker por número. */
  recordSendFailure(instanceId: string, tenantId: string): Promise<void>;
  /** Fecha o comando: sucesso → done; falha → retry/backoff até max_attempts. */
  completeCommand(commandId: string, success: boolean, errorMessage?: string): Promise<void>;
}

export type SendOutcome = {
  status: "sent" | "failed";
  /** Motivo sem PII, para log. Ausente quando enviou. */
  reason?: string;
};

const SEND_TYPE = "send_message";
const MEDIA_TYPE = "send_media";
const POLL_TYPE = "send_poll";

/** Tipos que passam pelo gate anti-ban (espelha o filtro de claim_send_commands). */
export const SEND_TYPES = [SEND_TYPE, MEDIA_TYPE, POLL_TYPE] as const;

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/**
 * jid → campo `number` da Evolution.
 *   - grupo (`…@g.us`): o jid inteiro (a Evolution endereça grupo pelo jid);
 *   - pessoa (`…@s.whatsapp.net` / `…@lid`): só a parte antes do `@`.
 */
function jidToNumber(jid: unknown): string | null {
  if (typeof jid !== "string" || jid.length === 0) return null;
  if (jid.endsWith("@g.us")) return jid;
  const at = jid.indexOf("@");
  const user = at === -1 ? jid : jid.slice(0, at);
  return user.length > 0 ? user : null;
}

function phoneToNumber(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

/** Alvo (`number` da Evolution) a partir de `jid` ou `phone`. Comum aos 3 tipos. */
function resolveNumber(p: Record<string, unknown>): string {
  const number = jidToNumber(p.jid) ?? phoneToNumber(p.phone);
  if (!number) throw new Error("comando de envio exige payload.jid ou payload.phone");
  return number;
}

/**
 * Traduz o payload de send_message para { number, text }. Lança se faltar alvo
 * ou texto — falha determinística (payload ruim), não sinal de saúde do número.
 */
export function resolveSendTarget(payload: unknown): SendTarget {
  const p = asRecord(payload);
  const number = resolveNumber(p);
  const text = firstString(p.text, p.message, p.body);
  if (!text) throw new Error("send_message exige payload.text");
  return { number, text };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Processa UM comando de envio. Nunca lança por erro de negócio: cada caminho
 * fecha o comando (completeCommand) e devolve o resultado. Só erros de infra
 * (banco fora no meio) propagam — aí o send-loop deixa o lease expirar e o
 * comando é reenfileirado.
 *
 * Ordem no caminho feliz: sendText → recordSend (conta/estica o gate) →
 * completeCommand(true). Se completeCommand falhar após o envio, o lease expira e
 * o comando volta à fila: risco de reenvio (at-least-once), aceito e igual ao
 * loop de eventos. record_send antes do complete garante que a janela já contou.
 */
export async function sendFromCommand(row: EngineCommandRow, deps: SendDeps): Promise<SendOutcome> {
  // claim_send_commands já filtra type e prontidão; estas checagens são defensivas.
  if (!(SEND_TYPES as readonly string[]).includes(row.type)) {
    await deps.completeCommand(row.command_id, false, `tipo inesperado: ${row.type}`);
    return { status: "failed", reason: "unexpected-type" };
  }
  if (!row.instance_id) {
    await deps.completeCommand(row.command_id, false, "comando sem instance_id");
    return { status: "failed", reason: "no-instance" };
  }

  // Monta o envio conforme o tipo. Tudo que for payload inválido falha ANTES de
  // tocar a rede e NÃO conta como falha do número (não é sinal de soft-ban).
  let send: (instanceName: string) => Promise<void>;
  try {
    const p = asRecord(row.payload);
    const number = resolveNumber(p);
    const mentionAll = p.mentionAll === true;

    if (row.type === POLL_TYPE) {
      const question = firstString(p.question, p.name);
      const options = Array.isArray(p.options)
        ? p.options.filter((o): o is string => typeof o === "string" && o.length > 0)
        : [];
      if (!question) throw new Error("send_poll exige payload.question");
      // O WhatsApp exige no mínimo 2 alternativas — falhar aqui evita um 400 da Evolution.
      if (options.length < 2) throw new Error("send_poll exige ao menos 2 opções");
      send = (name) => deps.sendPoll(name, number, { question, options });
    } else if (row.type === MEDIA_TYPE) {
      const mediaId = firstString(p.mediaId, p.media_id);
      if (!mediaId) throw new Error("send_media exige payload.mediaId");
      const rawType = firstString(p.mediaType, p.media_type) ?? "image";
      const mediatype: SendMediaInput["mediatype"] =
        rawType === "video" ? "video" : rawType === "document" ? "document" : "image";
      const caption = firstString(p.caption, p.text, p.message) ?? undefined;
      // Checagem de tenant obrigatória: o mediaId é o storage path codificado,
      // não um segredo — sem isto um comando forjado leria mídia de outro tenant.
      const storagePath = resolveMediaPath(mediaId, row.tenant_id);
      if (!storagePath) throw new Error("mediaId inválido ou de outro tenant");
      send = async (name) => {
        // Assinada agora, não no enqueue: a fila pode ter segurado isto por horas.
        const url = await deps.signedMediaUrl(storagePath);
        if (!url) throw new Error("mídia não encontrada no storage");
        await deps.sendMedia(name, number, { media: url, mediatype, caption, mentionAll });
      };
    } else {
      const text = firstString(p.text, p.message, p.body);
      if (!text) throw new Error("send_message exige payload.text");
      send = (name) => deps.sendText(name, number, text, { mentionAll });
    }
  } catch (err) {
    await deps.completeCommand(row.command_id, false, errMessage(err));
    return { status: "failed", reason: "bad-payload" };
  }

  const instanceName = await deps.instanceName(row.instance_id);
  if (!instanceName) {
    await deps.completeCommand(row.command_id, false, "instância sem provider_instance_id");
    return { status: "failed", reason: "no-provider-name" };
  }

  try {
    await send(instanceName);
  } catch (err) {
    // Falha de envio real → alimenta o breaker do número + retry/backoff do comando.
    await deps.recordSendFailure(row.instance_id, row.tenant_id);
    await deps.completeCommand(row.command_id, false, errMessage(err));
    return { status: "failed", reason: "send-error" };
  }

  await deps.recordSend(row.instance_id, row.tenant_id);
  await deps.completeCommand(row.command_id, true);
  return { status: "sent" };
}
