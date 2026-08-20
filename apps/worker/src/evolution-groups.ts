/**
 * Cliente HTTP da Evolution API v2.3.7 para OPERAÇÃO DE GRUPO (auto-grow).
 *
 * Substitui as chamadas Baileys de `runGrow` (`sock.groupCreate`,
 * `groupUpdateDescription`, `groupSettingUpdate`, `updateProfilePicture`,
 * `groupInviteCode`). Fica separado de `evolution-sender.ts` porque as duas
 * famílias têm risco diferente: enviar mensagem erra e reenvia; criar grupo é
 * irreversível do lado do WhatsApp e gasta a operação que mais aproxima do ban.
 *
 * ── Estado de verificação de cada rota ────────────────────────────────────
 * VERIFICADO contra a instância real:
 *   - `/group/inviteCode/{instance}?groupJid=` — exercitado no backfill de
 *     convite (ver `apps/web/src/lib/evolution/client.ts`), inclusive o
 *     comportamento de achatar qualquer falha num 404 `No invite code`.
 * NÃO verificado ainda (shape conforme a API v2 documentada):
 *   - `/group/create`, `/group/updateGroupDescription`, `/group/updateSetting`,
 *     `/group/updateGroupPicture`.
 * Se um deles devolver 400 no primeiro grow real, o ajuste é AQUI — nada fora
 * deste módulo depende do formato. É a mesma postura que `evolution-sender.ts`
 * assume para `sendMedia`/`sendPoll`, e o motivo de o loop nascer em dry-run.
 *
 * `memberAddMode` do template NÃO é aplicado: a Evolution v2 não expõe esse
 * setting. Não é bloqueante — o pool é populado por LINK de convite, nunca por
 * `add` — mas o grupo fica com o default do WhatsApp. Ver o log em `grow-loop`.
 */

import { parseInviteResponse } from "./invite-url.js";

export class EvolutionGroupError extends Error {
  /** 0 = não chegou na Evolution (timeout/rede); senão o HTTP status. */
  readonly status: number;

  constructor(status: number, operation: string, detail?: string) {
    super(`Evolution ${operation} falhou (${status})${detail ? `: ${detail}` : ""}`);
    this.name = "EvolutionGroupError";
    this.status = status;
  }
}

export interface EvolutionGroups {
  /** Cria o grupo só com o dono e devolve o JID (`...@g.us`). */
  createGroup(instanceName: string, subject: string): Promise<string>;
  setDescription(instanceName: string, groupJid: string, description: string): Promise<void>;
  setAnnounceOnly(instanceName: string, groupJid: string): Promise<void>;
  setPicture(instanceName: string, groupJid: string, imageUrl: string): Promise<void>;
  /** Convite canônico do grupo, ou null se a Evolution não devolveu um válido. */
  inviteUrl(instanceName: string, groupJid: string): Promise<string | null>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type EvolutionGroupsConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** Injetável para teste (sem rede). */
  fetchImpl?: FetchLike;
};

/** Criar grupo e trocar foto passam pelo WhatsApp; 15s é curto demais. */
const DEFAULT_TIMEOUT_MS = 30_000;

function safeDetail(body: string): string {
  return body.slice(0, 200);
}

/**
 * Extrai o JID do corpo de `/group/create`. Função PURA.
 *
 * Defensiva de propósito: se o JID vier num campo inesperado, devolver
 * `undefined` como se fosse um id gravaria um grupo fantasma no pool — com
 * `invite_url` de um grupo real e JID que não existe, o que é pior do que falhar.
 */
export function parseCreatedGroupJid(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  for (const key of ["id", "groupJid", "jid"]) {
    const value = record[key];
    if (typeof value === "string" && value.endsWith("@g.us")) return value;
  }
  return null;
}

export function createEvolutionGroups(config: EvolutionGroupsConfig): EvolutionGroups {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const doFetch: FetchLike = config.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(operation: string, path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: { apikey: config.apiKey, "Content-Type": "application/json", ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : "erro de rede";
      throw new EvolutionGroupError(0, operation, reason);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new EvolutionGroupError(response.status, operation, safeDetail(detail));
    }

    return (await response.json().catch(() => null)) as T;
  }

  const withJid = (path: string, instanceName: string, groupJid: string) =>
    `${path}/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`;

  return {
    async createGroup(instanceName, subject) {
      // `participants: []` é deliberado: o grupo nasce só com o dono e é populado
      // por link. Popular por `add` dispara account_reachout_restricted — regra
      // herdada do runGrow original e do anti-ban do projeto.
      const body = await request<unknown>("group/create", `/group/create/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        body: JSON.stringify({ subject, participants: [] }),
      });

      const jid = parseCreatedGroupJid(body);
      if (!jid) {
        throw new EvolutionGroupError(200, "group/create", "resposta sem JID de grupo utilizável");
      }
      return jid;
    },

    async setDescription(instanceName, groupJid, description) {
      await request("group/updateGroupDescription", withJid("/group/updateGroupDescription", instanceName, groupJid), {
        method: "POST",
        body: JSON.stringify({ description }),
      });
    },

    async setAnnounceOnly(instanceName, groupJid) {
      // "announcement" = só admin envia. Espelha groupSettingUpdate(jid, "announcement").
      await request("group/updateSetting", withJid("/group/updateSetting", instanceName, groupJid), {
        method: "POST",
        body: JSON.stringify({ action: "announcement" }),
      });
    },

    async setPicture(instanceName, groupJid, imageUrl) {
      // URL assinada de TTL curto: a Evolution busca a imagem no ato do POST.
      await request("group/updateGroupPicture", withJid("/group/updateGroupPicture", instanceName, groupJid), {
        method: "POST",
        body: JSON.stringify({ image: imageUrl }),
      });
    },

    async inviteUrl(instanceName, groupJid) {
      const body = await request<unknown>(
        "group/inviteCode",
        withJid("/group/inviteCode", instanceName, groupJid),
        { method: "GET" },
      );
      return parseInviteResponse(body);
    },
  };
}
