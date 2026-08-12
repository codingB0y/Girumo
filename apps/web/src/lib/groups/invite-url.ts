/**
 * Convite de grupo do WhatsApp — validação e forma canônica. Função PURA.
 *
 * Este campo é o destino final do `/r/<slug>`: um valor errado aqui não quebra
 * o painel, quebra do outro lado — o cliente da loja clica no link divulgado e
 * cai em lugar nenhum. Por isso aceita convite do WhatsApp e mais nada; uma URL
 * qualquer seria aceita silenciosamente e só apareceria como funil furado.
 *
 * Aceita a URL completa (com ou sem `https://`, com ou sem `www.`, com o
 * `/invite/` antigo, com query ou âncora) e também só o código colado sozinho.
 */

/** Código do convite: o que vem depois de chat.whatsapp.com/. */
const INVITE_CODE = /^[A-Za-z0-9_-]{6,64}$/;

const INVITE_URL =
  /^(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i;

/**
 * Devolve `https://chat.whatsapp.com/<código>` ou `null` quando não é convite.
 * `null` é o sinal de recusa — quem chama decide o erro que mostra.
 */
export function normalizeInviteUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const match = value.match(INVITE_URL);
  const code = match ? match[1] : value;

  if (!INVITE_CODE.test(code)) return null;
  return `https://chat.whatsapp.com/${code}`;
}
