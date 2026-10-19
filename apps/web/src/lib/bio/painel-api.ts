// apps/web/src/lib/bio/painel-api.ts
import "server-only";

import { linksMestresDasCampanhas } from "@/lib/bio/conferir";
import { SLUG_BIO, slugReservado, type DocumentoBio } from "@/lib/bio/documento";
import { dayBR, dayBRAgo } from "@/lib/date-br";
import { randomSuffix, slugify } from "@/lib/pages/slug";
import { assertPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { slugDisponivel, type PaginaBio } from "@/lib/stores/bio-pages";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";

/**
 * O que as três rotas de `app/api/link-da-bio` repartem (spec 2026-10-19-link-da-bio §8–§10).
 * O painel (PR 6a/6b) importa daqui só os tipos, com `import type`: o `server-only` não vai junto.
 */

/** 40 do `SLUG_BIO` menos "-" e os 4 caracteres de `randomSuffix()`. */
const RAIZ_MAX = 35;
const TENTATIVAS_DE_SLUG = 5;

export type CampanhaDoPainel = { id: string; nome: string; slug: string | null };

/** Corpo de `GET /api/link-da-bio`. */
export type RespostaDoPainelBio = {
  pagina: PaginaBio | null;
  campanhas: CampanhaDoPainel[];
  /** Hostname do domínio próprio ATIVO, sem esquema; pendente não conta. */
  dominio: string | null;
  /** `getPublicSiteUrl()`: o painel monta `${origemGirumo}/bio/${slug}`, nunca com o Host da request. */
  origemGirumo: string;
  /** Sem página: endereço livre para o "Criar minha página". Com página: o slug dela. */
  sugestaoSlug: string;
  linksEscondidos: string[];
};

/** Corpo de `PATCH /api/link-da-bio`: a página inteira, nunca um pedaço. */
export type CorpoDoPatchBio = { versao: number; slug: string; publicada: boolean; documento: DocumentoBio };

export type MotivoDoSlug = "formato" | "reservado" | "em-uso";

/** Corpo de `GET /api/link-da-bio/slug?valor=`. */
export type RespostaDoSlug = { disponivel: true } | { disponivel: false; motivo: MotivoDoSlug };

/** Erro das três rotas. Os 401/403 de sessão, de loja e da vendedora saem em texto, como em todo o painel. */
export type ErroDoPainelBio = { error: string; campo?: string; motivo?: "versao" | "slug" };

/** Por que o slug não serve, ou `null`. `em-uso` só o banco sabe (`slugDisponivel`). */
export function motivoDoSlug(slug: string): Exclude<MotivoDoSlug, "em-uso"> | null {
  // O `SLUG_BIO` do PR 2 já confere o tamanho (3–40, como o check do banco) junto com o formato.
  if (!SLUG_BIO.test(slug)) return "formato";
  return slugReservado(slug) ? "reservado" : null;
}

/** `?dias=7|30` → os últimos N dias contando hoje, em Brasília (spec §7). Fora disso, `null` (400). */
export function periodoDoRelatorio(dias: string | null, agora: Date = new Date()): { desde: string; ate: string } | null {
  if (dias !== "7" && dias !== "30") return null;
  return { desde: dayBRAgo(Number(dias) - 1, agora), ate: dayBR(agora) };
}

/** JSON puro, nunca guardado em cache: o painel lê o estado de agora. */
export function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/** 500 com a nossa mensagem; o erro de verdade só no log, nunca no corpo. `onde` identifica a rota no log. */
export function falhou(onde: string, tenantId: string, e: unknown, mensagem: string): Response {
  console.error(`[${onde}] ${tenantId}: ${(e as Error).message}`);
  return resposta({ error: mensagem } satisfies ErroDoPainelBio, 500);
}

/** 429 quando a loja passou de `max` pedidos em 60 s no balde `chave`; `null` quando pode seguir. */
export async function limiteDaLoja(chave: string, tenantId: string, max: number): Promise<Response | null> {
  if (!(await checkRateLimit(`${chave}:${tenantId}`, max, 60_000))) return null;
  return resposta({ error: "Muitas tentativas. Espere um minuto." } satisfies ErroDoPainelBio, 429);
}

/**
 * Sessão (Bearer do painel ou cookie) e loja. A vendedora para antes, no guard de módulo do
 * `getTenantContext`: `/api/link-da-bio` não está em `lib/auth/modulos.ts`, e o mapa é fechado por
 * padrão. Ler é de quem o guard deixa passar (dono, administração, operação); escrever pede
 * `campaign:edit`, a ação que libera editar a loja (spec §8).
 */
export async function lojaDoPainel(req: Request, acao: "ler" | "editar"): Promise<{ tenantId: string } | Response> {
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (acao === "editar") {
      // `role` só é nulo para a engine, que `allowEngine: false` já recusou.
      if (!ctx.role) return new Response("Sem permissão para esta ação.", { status: 403 });
      assertPermission(ctx.role, "campaign:edit");
    }
    return { tenantId: ctx.tenantId };
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[api/link-da-bio] sessão: ${(e as Error).message}`);
    return resposta({ error: "Não deu pra abrir o link da bio." } satisfies ErroDoPainelBio, 500);
  }
}

/**
 * Campanhas da loja para o botão "Grupo VIP". `slug` só quando o link mestre existe — a regra mora
 * no `linksMestresDasCampanhas` (PR 2), o mesmo que o `estadoDosLinks` usa para esconder o botão na
 * página pública. Uma implementação só: o painel nunca oferece um link que a página esconderia.
 */
export async function campanhasDaLoja(tenantId: string): Promise<CampanhaDoPainel[]> {
  const campanhas = await listCampaignGroups(tenantId);
  const mestres = await linksMestresDasCampanhas(tenantId, campanhas);
  return campanhas.map((c) => ({ id: c.id, nome: c.name, slug: mestres[c.id] ?? null }));
}

/**
 * Endereço sugerido e livre (spec §2): `slugify(nome)`; ocupado ou reservado, a raiz ganha sufixo
 * aleatório. Nome com "girumo"/"hubflow" fica reservado em qualquer variação, então a raiz vira
 * "loja". É só sugestão: o `criarPaginaDaLoja` ainda resolve colisão no insert.
 */
export async function sugerirSlug(nome: string, tenantId: string): Promise<string> {
  const base = slugify(nome);
  const raiz = /girumo|hubflow/.test(base) ? "loja" : base.slice(0, RAIZ_MAX).replace(/-+$/, "");
  let candidato = base;
  for (let i = 0; i < TENTATIVAS_DE_SLUG; i++) {
    if (motivoDoSlug(candidato) === null && (await slugDisponivel(candidato, tenantId))) return candidato;
    candidato = `${raiz}-${randomSuffix()}`;
  }
  return candidato;
}
