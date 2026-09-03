/**
 * Configurações de comportamento da campanha (`campaign_groups.metadata.settings.entrada`).
 *
 * Duas portas, de propósito diferentes:
 *  - `readEntrada` é TOLERANTE: campo inválido cai no padrão só dele. Quem lê é
 *    o /r/, e o /r/ nunca pode morrer por causa de um jsonb estranho.
 *  - `parseEntradaPatch` é ESTRITO: é o que valida o PATCH do painel. Chave
 *    desconhecida, URL sem https ou data fora do formato são recusadas com o
 *    nome do campo, para a tela mostrar o erro no lugar certo.
 *
 * Sem `server-only`: o módulo é puro e roda em `tsx --test` e no cliente.
 */
import { z } from "zod";

export type LotadoDestino =
  | { modo: "aviso" }
  | { modo: "pagina"; pagina_slug: string }
  | { modo: "url"; url: string };

export type EntradaSettings = {
  /** Em celular, tenta abrir o app pelo esquema whatsapp:// antes do link web. */
  deep_link: boolean;
  /** Cookie por campanha lembra o grupo da primeira entrada. */
  um_grupo_por_pessoa: boolean;
  /** "AAAA-MM-DD" ou null. Fim do dia em America/Sao_Paulo. */
  encerra_em: string | null;
  lotado: LotadoDestino;
};

export const ENTRADA_DEFAULTS: EntradaSettings = Object.freeze({
  deep_link: true,
  um_grupo_por_pessoa: true,
  encerra_em: null,
  lotado: { modo: "aviso" },
}) as EntradaSettings;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const lotadoSchema = z.discriminatedUnion("modo", [
  z.strictObject({ modo: z.literal("aviso") }),
  z.strictObject({
    modo: z.literal("pagina"),
    pagina_slug: z.string().regex(PAGE_SLUG, "slug da página inválido"),
  }),
  z.strictObject({
    modo: z.literal("url"),
    url: z.string().max(2000).refine(isHttpsUrl, "só aceitamos link https://"),
  }),
]);

const entradaSchema = z.strictObject({
  deep_link: z.boolean(),
  um_grupo_por_pessoa: z.boolean(),
  encerra_em: z.string().regex(ISO_DATE, "data no formato AAAA-MM-DD").nullable(),
  lotado: lotadoSchema,
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Leitura tolerante: campo inválido cai no padrão dele, nunca derruba o /r/. */
export function readEntrada(metadata: Record<string, unknown> | null | undefined): EntradaSettings {
  const settings = isRecord(metadata?.settings) ? metadata.settings : {};
  const raw = isRecord(settings.entrada) ? settings.entrada : {};
  const lotado = lotadoSchema.safeParse(raw.lotado);
  return {
    deep_link: typeof raw.deep_link === "boolean" ? raw.deep_link : ENTRADA_DEFAULTS.deep_link,
    um_grupo_por_pessoa:
      typeof raw.um_grupo_por_pessoa === "boolean" ? raw.um_grupo_por_pessoa : ENTRADA_DEFAULTS.um_grupo_por_pessoa,
    encerra_em: typeof raw.encerra_em === "string" && ISO_DATE.test(raw.encerra_em) ? raw.encerra_em : null,
    lotado: lotado.success ? lotado.data : ENTRADA_DEFAULTS.lotado,
  };
}

/** Validação estrita do PATCH. O erro nomeia o primeiro campo errado. */
export function parseEntradaPatch(
  input: unknown,
): { ok: true; entrada: EntradaSettings } | { ok: false; error: string } {
  const result = entradaSchema.safeParse(input);
  if (result.success) return { ok: true, entrada: result.data };
  const issue = result.error.issues[0];
  const path = issue.path.map(String).join(".") || "settings.entrada";
  return { ok: false, error: `${path}: ${issue.message}` };
}

/** Metadata novo com a entrada gravada — cópia, nunca mutação. */
export function withEntrada(
  metadata: Record<string, unknown> | null | undefined,
  entrada: EntradaSettings,
): Record<string, unknown> {
  const base = isRecord(metadata) ? metadata : {};
  const settings = isRecord(base.settings) ? base.settings : {};
  return { ...base, settings: { ...settings, entrada } };
}

/**
 * Encerrou? O dia termina às 23:59:59 em Brasília. UTC-3 fixo é correto: o
 * Brasil não tem horário de verão desde 2019.
 */
export function isClosedAt(encerraEm: string | null, now: Date): boolean {
  if (!encerraEm || !ISO_DATE.test(encerraEm)) return false;
  const end = Date.parse(`${encerraEm}T23:59:59.999-03:00`);
  return Number.isFinite(end) && now.getTime() > end;
}

/* ── Integrações ─────────────────────────────────────────────────────────────
 *
 * Mesma divisão de portas da entrada: `readIntegracoes` é tolerante (quem lê é
 * o /r/), `parseIntegracoesPatch` é estrito (quem valida é o PATCH). A regra
 * extra aqui é o token: ele nunca sai do servidor, então o painel não pode
 * reenviá-lo — omitir o campo tem de significar "não mexi nisso".
 */

export type MetaIntegracao = { pixel_id: string; evento: string; capi_token: string; test_code: string };
export type Integracoes = {
  meta: MetaIntegracao;
  ga4: { id: string };
  google_ads: { id: string; label: string };
};
/** Igual a `Integracoes`, mas o token é opcional: ausente = manter, "" = apagar. */
export type IntegracoesPatch = {
  meta: Omit<MetaIntegracao, "capi_token"> & { capi_token?: string };
  ga4: { id: string };
  google_ads: { id: string; label: string };
};

export const EVENTOS_PADRAO = ["Lead", "Contact", "CompleteRegistration"] as const;

export const INTEGRACOES_DEFAULTS: Integracoes = Object.freeze({
  meta: Object.freeze({ pixel_id: "", evento: "Lead", capi_token: "", test_code: "" }),
  ga4: Object.freeze({ id: "" }),
  google_ads: Object.freeze({ id: "", label: "" }),
}) as Integracoes;

const PIXEL_ID = /^\d{5,20}$/;
const GA4_ID = /^G-[A-Z0-9]+$/;
const ADS_ID = /^AW-\d+$/;
const ADS_LABEL = /^[A-Za-z0-9_-]+$/;
const EVENTO = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const TEST_CODE = /^[A-Za-z0-9]{1,32}$/;
/**
 * Token da API de Conversões: só o alfabeto de token, e longo.
 *
 * Existe porque o campo é `type="password"` e o Chrome ignora
 * `autocomplete="off"` — em 02/09/2026 ele autopreencheu o e-mail da conta por
 * cima do token de 204 caracteres, e o PATCH gravou. Um `@` ou 19 caracteres
 * nunca são um token: recusar aqui é o que impede o autofill de destruir uma
 * credencial em silêncio. O piso de 50 é folgado (os da Meta passam de 190).
 */
const CAPI_TOKEN = /^[A-Za-z0-9_-]{50,500}$/;

/** "" é sempre aceito (campo não configurado); preenchido tem de casar o regex. */
const vazioOu = (re: RegExp, msg: string) => z.string().refine((v) => v === "" || re.test(v), msg);

const integracoesPatchSchema = z.strictObject({
  meta: z.strictObject({
    pixel_id: vazioOu(PIXEL_ID, "o ID do pixel tem de ser só números (5 a 20 dígitos)"),
    evento: z.string().regex(EVENTO, "nome de evento inválido"),
    // "" apaga de propósito; qualquer outra coisa tem de PARECER um token.
    capi_token: z
      .string()
      .refine(
        (v) => v === "" || CAPI_TOKEN.test(v),
        "isso não parece um token da API de Conversões — confira se o navegador não preencheu o campo sozinho",
      )
      .optional(),
    test_code: vazioOu(TEST_CODE, "código de teste inválido"),
  }),
  ga4: z.strictObject({ id: vazioOu(GA4_ID, 'o ID do GA4 começa com "G-"') }),
  google_ads: z.strictObject({
    id: vazioOu(ADS_ID, 'o ID do Google Ads começa com "AW-"'),
    label: vazioOu(ADS_LABEL, "rótulo de conversão inválido"),
  }),
});

/** Leitura tolerante: campo inválido cai no padrão dele, nunca derruba o /r/. */
export function readIntegracoes(metadata: Record<string, unknown> | null | undefined): Integracoes {
  const settings = isRecord(metadata?.settings) ? metadata.settings : {};
  const raw = isRecord(settings.integracoes) ? settings.integracoes : {};
  const meta = isRecord(raw.meta) ? raw.meta : {};
  const ga4 = isRecord(raw.ga4) ? raw.ga4 : {};
  const ads = isRecord(raw.google_ads) ? raw.google_ads : {};
  const str = (v: unknown, re: RegExp, padrao: string): string => (typeof v === "string" && re.test(v) ? v : padrao);
  return {
    meta: {
      pixel_id: str(meta.pixel_id, PIXEL_ID, ""),
      evento: str(meta.evento, EVENTO, INTEGRACOES_DEFAULTS.meta.evento),
      capi_token: typeof meta.capi_token === "string" ? meta.capi_token : "",
      test_code: str(meta.test_code, TEST_CODE, ""),
    },
    ga4: { id: str(ga4.id, GA4_ID, "") },
    google_ads: { id: str(ads.id, ADS_ID, ""), label: str(ads.label, ADS_LABEL, "") },
  };
}

/** Validação estrita do PATCH. O erro nomeia o primeiro campo errado. */
export function parseIntegracoesPatch(
  input: unknown,
): { ok: true; patch: IntegracoesPatch } | { ok: false; error: string } {
  const result = integracoesPatchSchema.safeParse(input);
  if (result.success) return { ok: true, patch: result.data };
  const issue = result.error.issues[0];
  const path = issue.path.map(String).join(".") || "settings.integracoes";
  return { ok: false, error: `${path}: ${issue.message}` };
}

/**
 * Aplica o patch sobre o valor atual. `capi_token` ausente MANTÉM o que está no
 * banco; só `""` apaga. Sem essa distinção, todo salvamento do painel apagaria
 * o token — o formulário nunca recebeu o valor para poder devolvê-lo.
 */
export function mergeIntegracoes(atual: Integracoes, patch: IntegracoesPatch): Integracoes {
  return {
    meta: {
      pixel_id: patch.meta.pixel_id,
      evento: patch.meta.evento,
      capi_token: patch.meta.capi_token === undefined ? atual.meta.capi_token : patch.meta.capi_token,
      test_code: patch.meta.test_code,
    },
    ga4: { id: patch.ga4.id },
    google_ads: { id: patch.google_ads.id, label: patch.google_ads.label },
  };
}

/** Metadata novo com as integrações gravadas — cópia, nunca mutação. */
export function withIntegracoes(
  metadata: Record<string, unknown> | null | undefined,
  integracoes: Integracoes,
): Record<string, unknown> {
  const base = isRecord(metadata) ? metadata : {};
  const settings = isRecord(base.settings) ? base.settings : {};
  return { ...base, settings: { ...settings, integracoes } };
}

/** O que o GET pode dizer sobre o token: que existe e os 4 últimos. Nunca o valor. */
export function maskToken(token: string): { capi_token_set: boolean; capi_token_last4: string } {
  return { capi_token_set: token.length > 0, capi_token_last4: token.length > 0 ? token.slice(-4) : "" };
}

/**
 * Alguma integração configurada? É o que decide se o /r/ mostra o intersticial
 * mesmo sem deep link. Google Ads só conta com id E rótulo: sem rótulo não há
 * `send_to` e o gtag não dispara nada.
 */
export function hasIntegracao(i: Integracoes): boolean {
  return Boolean(i.meta.pixel_id || i.ga4.id || (i.google_ads.id && i.google_ads.label));
}
