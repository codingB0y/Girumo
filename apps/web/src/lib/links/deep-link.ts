/**
 * Deep link do WhatsApp e cookie "um grupo por pessoa" — funções puras do /r/.
 *
 * `whatsapp://chat?code=<CODE>` abre o app direto em celular, sem passar pela
 * página web do WhatsApp (que, dentro do navegador do Instagram, costuma parar
 * num "baixe o WhatsApp"). Um redirect 302 do servidor para esse esquema é
 * bloqueado ou pede confirmação; por isso quem navega é a tela de entrada, com
 * fallback para o link https e botão sempre visível.
 */

const INVITE_RE = /^https:\/\/chat\.whatsapp\.com\/([A-Za-z0-9]{6,64})$/;

export function inviteCode(url: string): string | null {
  const m = INVITE_RE.exec(url);
  return m ? m[1] : null;
}

export function whatsappDeepLink(url: string): string | null {
  const code = inviteCode(url);
  return code ? `whatsapp://chat?code=${code}` : null;
}

/** Só celular tenta o esquema: em desktop ele abre nada ou pede confirmação. */
export function isMobileUa(ua: string): boolean {
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

/** 90 dias — o tempo de uma campanha de estação. */
export const REMEMBER_MAX_AGE_S = 90 * 24 * 60 * 60;

/** Um cookie por campanha. Sem hífen: mantém o nome dentro do charset seguro. */
export function rememberCookieName(campaignId: string): string {
  return `gr_${campaignId.replace(/-/g, "")}`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Path restrito ao slug: o cookie de uma campanha não viaja para as outras.
 * HttpOnly porque nenhum script precisa lê-lo; Lax porque o clique vem de fora.
 */
export function rememberCookieHeader(name: string, whatsappGroupId: string, slug: string, secure: boolean): string {
  const attrs = [
    `${name}=${encodeURIComponent(whatsappGroupId)}`,
    `Path=/r/${slug}`,
    `Max-Age=${REMEMBER_MAX_AGE_S}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
