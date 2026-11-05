import type { TenantRole } from "@/lib/permissions";

/** O que a chamada quer fazer com as pessoas (§8 do spec). */
export type NivelPessoas = "ler" | "escrever" | "exportar" | "apagar";

/** Depois de cancelar o add-on, as fichas ficam 30 dias só para leitura e CSV (§5.5). */
export const DIAS_DE_LEITURA = 30;
const DIA_MS = 86_400_000;

type CodigoNegado = "instagram_disabled" | "instagram_read_only" | "forbidden";

export type AcessoPessoas =
  | { ok: true; somenteLeitura: boolean; fichasSomemEm: string | null; podeApagar: boolean; podeExportar: boolean }
  | { ok: false; status: 403; code: CodigoNegado; error: string };

const NEGADO = (code: CodigoNegado, error: string): AcessoPessoas => ({ ok: false, status: 403, code, error });
const SEM_ADD_ON = () => NEGADO("instagram_disabled", "O Instagram não está liberado para esta loja.");
const SO_ADMIN = () => NEGADO("forbidden", "Só o dono ou o administrador faz isso.");

type Entrada = { role: TenantRole; enabled: boolean; disabledAt: string | null; nivel: NivelPessoas; agoraMs: number };

/**
 * Regra pura (sem banco) de quem mexe em Pessoas:
 * ver/editar/etiquetar = dono, admin, operador com o add-on ligado; CSV e apagar = dono ou admin;
 * add-on cancelado há menos de 30 dias = só ler e exportar (dono ou admin); vendedora nunca.
 */
export function decidirPessoas({ role, enabled, disabledAt, nivel, agoraMs }: Entrada): AcessoPessoas {
  if (role === "seller") return NEGADO("forbidden", "Sem permissão para esta ação.");
  const admin = role === "owner" || role === "admin";
  const desligadoMs = disabledAt ? Date.parse(disabledAt) : NaN;
  const somemMs = desligadoMs + DIAS_DE_LEITURA * DIA_MS;
  const naJanela = !enabled && Number.isFinite(somemMs) && agoraMs < somemMs;
  if (!enabled && !naJanela) return SEM_ADD_ON();
  if (naJanela && !admin) return SEM_ADD_ON();
  if (!admin && (nivel === "exportar" || nivel === "apagar")) return SO_ADMIN();
  if (naJanela && (nivel === "escrever" || nivel === "apagar")) {
    return NEGADO("instagram_read_only", "O Instagram foi cancelado: as pessoas ficam só para leitura e exportação.");
  }
  return {
    ok: true,
    somenteLeitura: naJanela,
    fichasSomemEm: naJanela ? new Date(somemMs).toISOString() : null,
    podeApagar: admin && !naJanela,
    podeExportar: admin,
  };
}
