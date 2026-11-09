import { createHash } from "node:crypto";

import { z } from "zod";

import { EVENTOS_YAMPI, type EventoYampi } from "./tipos";

/** O maior aviso visto na Fase 0 tem 16,7 KB (Y19): 1 MiB é folga, não meta. */
export const LIMITE_CORPO_AVISO = 1024 * 1024;

export type EnvelopeYampi = { evento: EventoYampi; time: string | null; alias: string; recursoId: string | null; recurso: unknown };

const comEvento = z.object({ event: z.string() });
const corpoDoAviso = z.object({
  merchant: z.object({ alias: z.string().min(1).max(100) }),
  time: z.string().nullish(),
  resource: z.unknown(),
});

function eventoConhecido(evento: string): evento is EventoYampi {
  return (EVENTOS_YAMPI as readonly string[]).includes(evento);
}

function idDoRecurso(recurso: unknown): string | null {
  if (!recurso || typeof recurso !== "object") return null;
  const id = (recurso as { id?: unknown }).id;
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  if (typeof id === "string" && id !== "") return id;
  return null;
}

/** Envelope `{ event, time, merchant, resource }` da Yampi (Fase 0, S1). Outro evento vem antes do formato. */
export function lerEnvelope(json: unknown): { ok: true; envelope: EnvelopeYampi } | { ok: false; motivo: "formato" | "outro_evento" } {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ok: false, motivo: "formato" };
  const base = comEvento.safeParse(json);
  if (!base.success) return { ok: false, motivo: "formato" };
  const evento = base.data.event;
  if (!eventoConhecido(evento)) return { ok: false, motivo: "outro_evento" };
  const resto = corpoDoAviso.safeParse(json);
  if (!resto.success) return { ok: false, motivo: "formato" };
  const recurso = resto.data.resource ?? null;
  return {
    ok: true,
    envelope: { evento, time: resto.data.time ?? null, alias: resto.data.merchant.alias, recursoId: idDoRecurso(recurso), recurso },
  };
}

/**
 * O envelope não traz id de evento: dois status do mesmo pedido no mesmo segundo teriam a mesma chave natural.
 * O hash do corpo cru separa os dois e junta o reenvio idêntico.
 */
export function chaveDeDedupe(conexaoId: string, corpo: Uint8Array): string {
  return `${conexaoId}:${createHash("sha256").update(corpo).digest("hex")}`;
}

const TIME_DA_YAMPI = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;
const IDADE_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURO_MAXIMO_MS = 5 * 60 * 1000;

/**
 * A dedupe só vale enquanto a linha existe, e `yampi_events` some em 30 dias: um aviso assinado reenviado depois
 * disso entraria de novo (um `cart.reminder` velho virava DM). O `time` vem em hora de Brasília sem fuso (Fase 0,
 * Y5; o Brasil não tem horário de verão desde 2019). `time` que não se lê não recusa: a assinatura já valeu.
 */
export function avisoForaDaJanela(time: string | null, agora: number = Date.now()): boolean {
  const partes = time ? TIME_DA_YAMPI.exec(time) : null;
  if (!partes) return false;
  const instante = Date.parse(`${partes[1]}T${partes[2]}-03:00`);
  if (Number.isNaN(instante)) return false;
  return agora - instante > IDADE_MAXIMA_MS || instante - agora > FUTURO_MAXIMO_MS;
}
