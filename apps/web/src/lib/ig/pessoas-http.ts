import "server-only";

import { z } from "zod";
import { FIELD_KEY_RE, normalizeTag, TAG_RE } from "@/lib/ig/flow/names";
import { traduzErro } from "@/lib/ig/transport/erros";
import type { AtendimentoDaPessoaDto, PessoaDto } from "@/lib/ig/pessoas-tipos";
import { listFlows } from "@/lib/stores/ig-flows";
import { LimiteDeVarredura, type ContactFilters } from "@/lib/stores/ig-contacts-lista";
import type { IgContactRow } from "@/lib/stores/ig-contacts";
import type { RunRow } from "@/lib/stores/ig-runs";

/** Pedaços compartilhados pelas rotas `/api/ig/contacts/*`: entrada validada e linha do banco → tela. */

const MAX_TAGS_NO_FILTRO = 10;

const filtrosBase = z.object({
  q: z.string().max(60).optional(),
  tags: z.array(z.string().regex(TAG_RE)).max(MAX_TAGS_NO_FILTRO).optional(),
  campo: z.string().regex(FIELD_KEY_RE).optional(),
  valor: z.string().max(200).optional(),
  recencia: z.enum(["24h", "7d", "30d", "tudo"]).optional(),
});

/** campo e valor andam juntos: um sem o outro é filtro mal formado, não "sem filtro". */
export const filtrosSchema = filtrosBase.refine((f) => (f.campo === undefined) === (f.valor === undefined), { message: "campo e valor andam juntos" });

export type FiltrosEntrada = z.infer<typeof filtrosBase>;

export function paraFiltros(f: FiltrosEntrada): ContactFilters {
  return {
    q: f.q?.trim() || undefined,
    tags: f.tags?.length ? f.tags : undefined,
    field: f.campo !== undefined && f.valor !== undefined ? { key: f.campo, value: f.valor } : undefined,
    recencia: f.recencia,
  };
}

/** `?q=&tags=a,b&campo=&valor=&recencia=&pagina=` → filtros + página, ou `null` se algo for inválido. */
export function lerFiltrosDaUrl(params: URLSearchParams): { filtros: ContactFilters; pagina: number } | null {
  const tags = params.get("tags");
  const bruto = {
    q: params.get("q") ?? undefined,
    tags: tags ? tags.split(",").filter(Boolean) : undefined,
    campo: params.get("campo") ?? undefined,
    valor: params.get("valor") ?? undefined,
    recencia: params.get("recencia") ?? undefined,
  };
  const r = filtrosSchema.safeParse(bruto);
  const pagina = Number(params.get("pagina") ?? 1);
  if (!r.success || !Number.isInteger(pagina) || pagina < 1 || pagina > 100_000) return null;
  return { filtros: paraFiltros(r.data), pagina };
}

/** Etiquetas digitadas → normalizadas; `null` se alguma não sobra nada válido (a tela mostra erro, não descarta em silêncio). */
export function normalizarEtiquetas(textos: string[]): string[] | null {
  const tags = textos.map(normalizeTag);
  return tags.every((t): t is string => t !== null) ? [...new Set(tags)] : null;
}

/** Nome do fluxo por id (a loja tem poucos fluxos). */
export async function nomesDosFluxos(tenantId: string): Promise<Map<string, string>> {
  return new Map((await listFlows(tenantId)).map((f) => [f.id, f.name]));
}

export function paraPessoa(r: IgContactRow, fluxos: Map<string, string>): PessoaDto {
  return {
    id: r.id,
    username: r.username,
    fields: r.fields,
    tags: r.tags,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    lastDmAt: r.last_dm_at,
    sourceFlowId: r.source_flow_id,
    sourceFlowName: r.source_flow_id ? (fluxos.get(r.source_flow_id) ?? null) : null,
  };
}

export function paraAtendimento(r: RunRow, fluxos: Map<string, string>): AtendimentoDaPessoaDto {
  return { id: r.id, flowId: r.flow_id, flowName: fluxos.get(r.flow_id) ?? null, sourceKind: r.source_kind, matchedKeyword: r.matched_keyword, status: r.status, errorText: traduzErro(r.error_code), startedAt: r.started_at };
}

/** `Response` lançada pelo guarda sai como está; filtro grande demais vira 422; o resto estoura (500 com log). */
export function responderErro(e: unknown): Response {
  if (e instanceof Response) return e;
  if (e instanceof LimiteDeVarredura) return Response.json({ error: e.message, code: "too_many" }, { status: 422 });
  throw e;
}

export const invalido = (): Response => Response.json({ error: "Corpo inválido." }, { status: 400 });
export const naoAchou = (): Response => Response.json({ error: "Pessoa não encontrada." }, { status: 404 });
