/**
 * Cliente HTTP da Evolution API v2.3.7 para OPERAÇÃO DE GRUPO (auto-grow).
 *
 * Substitui as chamadas Baileys de `runGrow` (`sock.groupCreate`,
 * `groupUpdateDescription`, `groupSettingUpdate`, `updateProfilePicture`,
 * `groupInviteCode`). Fica separado de `evolution-sender.ts` porque as duas
 * famílias têm risco diferente: enviar mensagem erra e reenvia; criar grupo é
 * irreversível do lado do WhatsApp e gasta a operação que mais aproxima do ban.
 *
 * ── Contrato, conferido no código da v2.3.7 ───────────────────────────────
 * Os shapes abaixo saíram de `src/validate/group.schema.ts` e
 * `src/api/routes/group.router.ts` da tag 2.3.7 (o mesmo build que roda no
 * Coolify), não da documentação:
 *
 *   POST /group/create/{instance}
 *        required: subject, participants — `participants` tem `minItems: 1`.
 *   POST /group/updateGroupDescription/{instance}   required: groupJid, description
 *   POST /group/updateSetting/{instance}            required: groupJid, action
 *        action ∈ announcement | not_announcement | locked | unlocked
 *   POST /group/updateGroupPicture/{instance}       required: groupJid, image
 *   GET  /group/inviteCode/{instance}?groupJid=     (já usado no backfill)
 *
 * `groupJid` pode ir na query: `groupValidate` (abstract.router.ts) lê do corpo
 * e cai para `request.query.groupJid`.
 *
 * ── Por que `participants` leva o número do PRÓPRIO dono ───────────────────
 * A engine Baileys chamava `sock.groupCreate(subject, [])` — array vazio. A
 * Evolution NÃO aceita: o schema exige `minItems: 1`, então `[]` seria 400 em
 * todo grow. Mandamos o número da própria instância, e isso não fura o
 * anti-ban: quem cria o grupo já é membro dele por definição, então não há
 * `add` de terceiro e nada que dispare `account_reachout_restricted`. O pool
 * continua sendo populado só por LINK de convite.
 *
 * `memberAddMode` do template NÃO é aplicado: a v2.3.7 não tem rota para esse
 * setting (o router só expõe updateSetting com o enum acima). Não é bloqueante
 * — o pool é populado por link, nunca por `add` — mas o grupo fica com o
 * default do WhatsApp.
 *
 * A descrição é aplicada em chamada SEPARADA, embora `createGroupSchema` aceite
 * `description` no próprio create. É deliberado: no service da Evolution
 * (`whatsapp.baileys.service.ts:4336`) o `groupUpdateDescription` roda dentro do
 * mesmo try do create, então uma falha ali vira 500 DEPOIS de o grupo existir —
 * e a resposta não traz o JID. O grupo ficaria órfão no WhatsApp, invisível para
 * o pool. Separado, a descrição é best-effort e o JID nunca se perde.
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
  /**
   * Cria o grupo só com o dono e devolve o JID (`...@g.us`).
   *
   * `ownerPhone` são os dígitos do número da própria instância — exigidos pelo
   * `minItems: 1` de `participants`. Ver o cabeçalho.
   */
  createGroup(instanceName: string, subject: string, ownerPhone: string): Promise<string>;
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
    async createGroup(instanceName, subject, ownerPhone) {
      // Só o dono na lista: o grupo nasce vazio de terceiros e é populado por
      // link. `participants` é obrigatório com minItems 1 no schema da v2.3.7 —
      // ver o cabeçalho para por que o próprio número não fura o anti-ban.
      const digits = ownerPhone.replace(/\D/g, "");
      if (digits.length < 10) {
        // O schema recusa (`minLength: 10`), e a Evolution ainda valida o número
        // contra o WhatsApp e filtra o que não existe — o que devolveria a lista
        // vazia e um erro obscuro. Falhar aqui dá a causa certa.
        throw new EvolutionGroupError(0, "group/create", "número da instância ausente ou inválido");
      }

      const body = await request<unknown>("group/create", `/group/create/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        body: JSON.stringify({ subject, participants: [digits] }),
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
