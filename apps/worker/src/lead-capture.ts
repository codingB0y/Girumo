/**
 * Decisão de captura de lead a partir de um evento `engine_events`.
 *
 * O acesso ao banco é injetado (`CaptureDeps`) para que toda a regra fique
 * testável sem Postgres. O event-loop fornece as deps reais (Supabase) e trata
 * claim/complete; aqui só mora a lógica.
 *
 * Escopo da F3: SÓ GRUPOS. Nenhuma mensagem é enviada — o worker apenas lê
 * eventos e grava leads. Regras preservadas do comportamento validado:
 *   - só `action: "add"` vira lead; remove/promote/demote são registrados
 *     (o evento é marcado processado) mas não criam lead;
 *   - só grupos onde somos admin (`groups.is_admin`) alimentam captura —
 *     "melhor não capturar do que capturar grupo errado" (LGPD + base suja);
 *   - opt-out bloqueia a captura inteira, não só um envio;
 *   - `@lid` sem telefone vira lead com `phone` nulo; nunca inventa número.
 *
 * Camada 2 do executor de automações (docs/superpowers/plans/2026-07-29-automations-executor.md):
 * todo lead capturado com sucesso dispara `lead_entered` para as automações
 * `enabled` do tenant. Reentrada do mesmo lead (dedupe por telefone no
 * upsert) chama o hook de novo, mas não duplica o run — o dedupe_key
 * `lead:<lead_id>:<automation_id>` é único no banco; ver `enqueueLeadEnteredRuns`.
 */

import { normalizeParticipant, type RawParticipant } from "./participants.js";

export type EngineEventRow = {
  event_id: string;
  tenant_id: string;
  type: string;
  payload: unknown;
};

export type GroupInfo = {
  name: string | null;
  isAdmin: boolean;
};

export type UpsertLeadInput = {
  tenantId: string;
  /** `null` para participante `@lid` sem telefone. */
  phone: string | null;
  name: string | null;
  sourceGroupId: string;
  sourceGroupName: string | null;
};

export type LeadEnteredTriggerInput = {
  tenantId: string;
  /** id do lead retornado pelo upsert — estável por pessoa (dedupe por telefone). */
  leadId: string;
  /** grupo em que o lead entrou; sempre `@g.us` (JID de grupo do evento Baileys). */
  groupJid: string;
};

export interface CaptureDeps {
  /** Grupo por (tenant, whatsapp_group_id), ou `null` se não sincronizado. */
  getGroup(tenantId: string, whatsappGroupId: string): Promise<GroupInfo | null>;
  /** `true` se o telefone está na lista de descadastro do tenant. */
  isOptedOut(tenantId: string, phone: string): Promise<boolean>;
  /** Devolve o id do lead (novo ou reencontrado por dedupe de telefone). */
  upsertLead(input: UpsertLeadInput): Promise<string>;
  /** Cria um `automation_run` por automação `lead_entered` habilitada do tenant. */
  triggerLeadEnteredAutomations(input: LeadEnteredTriggerInput): Promise<void>;
}

export type CaptureOutcome = {
  /** Leads criados ou reencontrados neste evento. */
  leads: number;
  /** Participantes ignorados por opt-out. */
  optedOut: number;
  /** Motivo de não ter capturado nada, para log sem PII. Ausente quando capturou. */
  reason?: string;
};

const PARTICIPANTS_EVENT = "group-participants.update";
const ADD_ACTION = "add";

type ParsedParticipants = {
  groupId: string;
  action: string;
  participants: RawParticipant[];
};

/**
 * Lê o payload cru (jsonb de `engine_events.payload`) de forma defensiva.
 *
 * O payload é o webhook cru menos a credencial (ver stripCredentials na F2), mas
 * aqui tratamos como `unknown`: o worker não confia na forma, valida o que lê.
 */
export function parseParticipantsPayload(payload: unknown): ParsedParticipants | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const groupId = typeof record.id === "string" && record.id.length > 0 ? record.id : null;
  const action = typeof record.action === "string" && record.action.length > 0 ? record.action : null;
  const rawParticipants = Array.isArray(record.participants) ? record.participants : null;
  if (!groupId || !action || !rawParticipants) return null;

  const participants: RawParticipant[] = rawParticipants
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map((p) => ({
      id: typeof p.id === "string" ? p.id : null,
      phoneNumber: typeof p.phoneNumber === "string" ? p.phoneNumber : null,
      admin: typeof p.admin === "string" ? p.admin : null,
    }));

  return { groupId, action, participants };
}

/**
 * Processa um evento e devolve o resumo (sem PII).
 *
 * Nunca marca status: quem falha lança, e o event-loop decide processed/failed.
 * Todo caminho de "não capturou" devolve `reason` para o log dizer por quê.
 */
export async function captureFromEvent(
  row: EngineEventRow,
  deps: CaptureDeps,
): Promise<CaptureOutcome> {
  if (row.type !== PARTICIPANTS_EVENT) {
    return { leads: 0, optedOut: 0, reason: "not-participants-event" };
  }

  const parsed = parseParticipantsPayload(row.payload);
  if (!parsed) {
    return { leads: 0, optedOut: 0, reason: "unparseable-payload" };
  }

  // remove/promote/demote: registrado (evento processado), mas não vira lead.
  if (parsed.action !== ADD_ACTION) {
    return { leads: 0, optedOut: 0, reason: `action:${parsed.action}` };
  }

  const group = await deps.getGroup(row.tenant_id, parsed.groupId);
  if (!group) {
    return { leads: 0, optedOut: 0, reason: "group-unknown" };
  }
  if (!group.isAdmin) {
    return { leads: 0, optedOut: 0, reason: "group-not-admin" };
  }

  let leads = 0;
  let optedOut = 0;

  for (const raw of parsed.participants) {
    const { phone } = normalizeParticipant(raw);

    // Só há como checar opt-out com telefone; `@lid` sem número segue como lead.
    if (phone && (await deps.isOptedOut(row.tenant_id, phone))) {
      optedOut += 1;
      continue;
    }

    const leadId = await deps.upsertLead({
      tenantId: row.tenant_id,
      phone,
      // O payload não traz nome do participante (ver fixtures); fica nulo.
      name: null,
      sourceGroupId: parsed.groupId,
      sourceGroupName: group.name,
    });
    await deps.triggerLeadEnteredAutomations({
      tenantId: row.tenant_id,
      leadId,
      groupJid: parsed.groupId,
    });
    leads += 1;
  }

  return { leads, optedOut };
}
