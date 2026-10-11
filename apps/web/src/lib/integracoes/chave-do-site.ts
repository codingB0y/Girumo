// apps/web/src/lib/integracoes/chave-do-site.ts
import { createHash, randomBytes } from "node:crypto";

/**
 * Chave do site próprio do lojista (spec 2026-10-10-funil-anuncios §7).
 *
 * No banco só fica o sha256: quem lê a tabela não consegue se passar pela loja.
 * A busca é por igualdade do hash (índice único), então não existe comparação
 * de string da chave para medir tempo.
 */

const PREFIXO = "gk_live_";
const FORMATO = /^gk_live_[A-Za-z0-9_-]{43}$/;

export type ChaveNova = { chave: string; hash: string; last4: string };

export function hashDaChave(chave: string): string {
  return createHash("sha256").update(chave).digest("hex");
}

export function gerarChave(): ChaveNova {
  const chave = PREFIXO + randomBytes(32).toString("base64url");
  return { chave, hash: hashDaChave(chave), last4: chave.slice(-4) };
}

/** `Authorization: Bearer gk_live_…` → a chave; qualquer outro formato → null, sem ir ao banco. */
export function chaveDoCabecalho(authorization: string | null): string | null {
  const achado = /^Bearer\s+(\S+)$/.exec(authorization ?? "");
  if (!achado) return null;
  return FORMATO.test(achado[1]) ? achado[1] : null;
}
