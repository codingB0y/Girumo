/**
 * Convite de grupo do WhatsApp — forma canônica. Função PURA.
 *
 * Espelha `apps/web/src/lib/groups/invite-url.ts` (o worker não importa do app,
 * mesmo arranjo de `media-id.ts` em relação a `media-path.ts`). Se um dos dois
 * mudar, o outro precisa acompanhar — por isso a regra fica idêntica de
 * propósito, sem "melhorias" locais.
 *
 * Existe aqui porque a resposta da Evolution é dado de terceiro: a engine antiga
 * montava `https://chat.whatsapp.com/${code}` concatenando o que viesse. Um valor
 * inesperado entraria no pool e o cliente da loja clicaria no /r/<campanha> para
 * cair em lugar nenhum — falha que não aparece no painel, só no funil.
 */

/** Código do convite: o que vem depois de chat.whatsapp.com/. */
const INVITE_CODE = /^[A-Za-z0-9_-]{6,64}$/;

const INVITE_URL =
  /^(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i;

/** `https://chat.whatsapp.com/<código>`, ou `null` quando não é convite. */
export function normalizeInviteUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const match = value.match(INVITE_URL);
  const code = match ? match[1] : value;

  if (!code || !INVITE_CODE.test(code)) return null;
  return `https://chat.whatsapp.com/${code}`;
}

/**
 * Extrai o convite do corpo da Evolution (`{ inviteUrl, inviteCode }`).
 *
 * Espelha `parseInviteCodeResponse` do app, que já foi exercitado contra a
 * instância real no backfill de convite — os dois campos existem porque a
 * v2.3.7 responde ora um, ora outro.
 */
export function parseInviteResponse(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const candidate =
    typeof record.inviteUrl === "string" && record.inviteUrl
      ? record.inviteUrl
      : typeof record.inviteCode === "string"
        ? record.inviteCode
        : null;
  if (!candidate) return null;
  return normalizeInviteUrl(candidate);
}
