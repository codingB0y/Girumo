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
