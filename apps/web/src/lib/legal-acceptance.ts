/**
 * Registro de aceite dos documentos legais.
 *
 * A prova de consentimento precisa dizer QUEM aceitou, QUANDO e QUAL VERSÃO
 * (LGPD, art. 8º, §1º). O checkbox da tela não prova nada sozinho — ele é
 * client-side e some num `curl`. Quem decide se houve aceite é o servidor, com
 * a versão que o cliente afirma ter lido conferida contra `LEGAL_VERSION`.
 *
 * A lógica mora aqui, fora dos route handlers, porque os dois caminhos que
 * criam conta (cadastro por senha e primeiro acesso via Google) precisam da
 * mesma regra — e porque route handler não roda sob `tsx --test`.
 */

import { LEGAL_VERSION } from "./legal";

/** Documentos cobertos por um único aceite. */
export const LEGAL_DOCUMENTS = ["terms", "privacy"] as const;

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

/** De onde veio o aceite. Útil na auditoria, sem valor de controle. */
export type LegalAcceptanceSource = "signup" | "google_oauth";

export type LegalAcceptanceRow = {
  auth_user_id: string;
  tenant_id: string | null;
  document: LegalDocument;
  version: string;
  ip: string | null;
  user_agent: string | null;
  source: LegalAcceptanceSource;
};

export type LegalVersionCheck =
  | { ok: true; version: string }
  | { ok: false; status: number; error: string; code: "legal_required" | "legal_outdated" };

/**
 * O aceite declarado pelo cliente vale?
 *
 * Distingue dois erros de propósito, porque a tela reage diferente a cada um:
 * faltar aceite é 400 (marque o checkbox), e aceitar versão vencida é 409
 * (recarregue — o texto mudou desde que você abriu a página). Tratar os dois
 * como 400 faria a tela pedir para marcar um checkbox que já está marcado.
 */
export function checkLegalVersion(version: unknown): LegalVersionCheck {
  if (typeof version !== "string" || version.trim() === "") {
    return {
      ok: false,
      status: 400,
      code: "legal_required",
      error: "É preciso aceitar os Termos de Uso e a Política de Privacidade para criar a conta.",
    };
  }

  if (version.trim() !== LEGAL_VERSION) {
    return {
      ok: false,
      status: 409,
      code: "legal_outdated",
      error: "Os Termos de Uso foram atualizados. Recarregue a página e aceite a versão nova.",
    };
  }

  return { ok: true, version: LEGAL_VERSION };
}

/**
 * Uma linha por documento, com a mesma versão.
 *
 * O usuário marca um checkbox só, mas ele cobre dois documentos. Guardar
 * separado deixa versionar Termos e Política independentemente mais tarde sem
 * ter de reinterpretar registros antigos.
 */
export function buildAcceptanceRows(input: {
  authUserId: string;
  tenantId: string | null;
  version: string;
  ip: string | null;
  userAgent: string | null;
  source: LegalAcceptanceSource;
}): LegalAcceptanceRow[] {
  return LEGAL_DOCUMENTS.map((document) => ({
    auth_user_id: input.authUserId,
    tenant_id: input.tenantId,
    document,
    version: input.version,
    ip: input.ip,
    user_agent: input.userAgent,
    source: input.source,
  }));
}

/**
 * IP de quem aceitou.
 *
 * `x-forwarded-for` chega como "cliente, proxy1, proxy2": o cliente é o
 * PRIMEIRO. Pegar o último grava o IP da nossa própria infra em toda linha, e
 * aí a prova de consentimento não aponta para pessoa nenhuma.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }

  const real = headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : null;
}

/** User-agent com teto: é campo controlado por quem chama a rota. */
export function userAgentFromHeaders(headers: Headers): string | null {
  const ua = headers.get("user-agent")?.trim();
  return ua ? ua.slice(0, 512) : null;
}

/**
 * O mínimo que este módulo precisa de um cliente Supabase.
 *
 * Tipo estrutural em vez de importar `SupabaseClient`: mantém o arquivo livre
 * de dependência de runtime e testável com um dublê de três linhas — o mesmo
 * motivo pelo qual a lógica não mora dentro do route handler.
 */
export type AcceptanceWriter = {
  from(table: string): {
    upsert(
      values: LegalAcceptanceRow[],
      options: { onConflict: string; ignoreDuplicates: boolean },
      // PromiseLike, não Promise: o builder do supabase-js é thenable mas não é
      // uma Promise completa (não tem catch/finally). Exigir Promise aqui
      // rejeita o cliente real e só o dublê do teste passaria — o tipo estaria
      // descrevendo o teste, não o uso.
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

/**
 * Grava o aceite. Devolve `null` em sucesso ou a mensagem do banco em falha —
 * nunca engole o erro: aceite que não gravou é conta sem prova de
 * consentimento, e quem chama precisa poder decidir o que fazer com isso.
 *
 * `ignoreDuplicates` porque a prova já existe: reenviar o mesmo aceite (retry,
 * duplo clique) não é erro nem motivo para uma segunda linha.
 */
export async function recordLegalAcceptance(
  supabase: AcceptanceWriter,
  input: {
    authUserId: string;
    tenantId: string | null;
    version: string;
    ip: string | null;
    userAgent: string | null;
    source: LegalAcceptanceSource;
  },
): Promise<string | null> {
  const { error } = await supabase
    .from("legal_acceptances")
    .upsert(buildAcceptanceRows(input), {
      onConflict: "auth_user_id,document,version",
      ignoreDuplicates: true,
    });

  return error ? error.message : null;
}
