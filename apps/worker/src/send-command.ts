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
  sendText(instanceName: string, number: string, text: string): Promise<void>;
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

/**
 * Traduz o payload de send_message para { number, text }. Lança se faltar alvo
 * ou texto — falha determinística (payload ruim), não sinal de saúde do número.
 */
export function resolveSendTarget(payload: unknown): SendTarget {
  const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const number = jidToNumber(p.jid) ?? phoneToNumber(p.phone);
  const text = firstString(p.text, p.message, p.body);
  if (!number) throw new Error("send_message exige payload.jid ou payload.phone");
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
  if (row.type !== SEND_TYPE) {
    await deps.completeCommand(row.command_id, false, `tipo inesperado: ${row.type}`);
    return { status: "failed", reason: "unexpected-type" };
  }
  if (!row.instance_id) {
    await deps.completeCommand(row.command_id, false, "comando sem instance_id");
    return { status: "failed", reason: "no-instance" };
  }

  let target: SendTarget;
  try {
    target = resolveSendTarget(row.payload);
  } catch (err) {
    // Payload inválido: NÃO conta como falha do número (não é soft-ban).
    await deps.completeCommand(row.command_id, false, errMessage(err));
    return { status: "failed", reason: "bad-payload" };
  }

  const instanceName = await deps.instanceName(row.instance_id);
  if (!instanceName) {
    await deps.completeCommand(row.command_id, false, "instância sem provider_instance_id");
    return { status: "failed", reason: "no-provider-name" };
  }

  try {
    await deps.sendText(instanceName, target.number, target.text);
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
