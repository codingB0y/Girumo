import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * O `state` que vai na `redirect_url` da Zernio e volta no callback. Assinado
 * com HMAC e separado por domínio (mesmo molde de pages/render-context-core),
 * vale 10 minutos e carrega a loja e o perfil: o callback confere a loja da
 * sessão contra ele e NUNCA confia nos ids que a Zernio põe na query.
 */
const DOMINIO = "ig-connect-state";
const VALIDADE_MS = 10 * 60_000;

export type Estado = { tenantId: string; profileId: string; exp: number; nonce: string };

function assina(corpo: string, segredo: string): Buffer {
  return createHmac("sha256", segredo).update(DOMINIO).update(".").update(corpo).digest();
}

export function emitirEstado(tenantId: string, profileId: string, segredo: string, agora = Date.now()): string {
  if (!segredo) throw new Error("Segredo do estado ausente.");
  const estado: Estado = { tenantId, profileId, exp: agora + VALIDADE_MS, nonce: randomBytes(8).toString("hex") };
  const corpo = Buffer.from(JSON.stringify(estado)).toString("base64url");
  return `${corpo}.${assina(corpo, segredo).toString("base64url")}`;
}

export function lerEstado(token: string | null, segredo: string, agora = Date.now()): Estado | null {
  if (!token || !segredo) return null;
  const [corpo, sig, sobra] = token.split(".");
  if (!corpo || !sig || sobra !== undefined) return null;
  const esperada = assina(corpo, segredo);
  const recebida = Buffer.from(sig, "base64url");
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;
  try {
    const e = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as Partial<Estado>;
    if (typeof e.tenantId !== "string" || typeof e.profileId !== "string" || typeof e.exp !== "number" || typeof e.nonce !== "string") return null;
    if (e.exp < agora) return null;
    return { tenantId: e.tenantId, profileId: e.profileId, exp: e.exp, nonce: e.nonce };
  } catch {
    return null;
  }
}
