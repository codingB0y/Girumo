// apps/web/src/app/api/link-da-bio/route.ts
import { z } from "zod";

import { invalidarBio } from "@/lib/bio/cache";
import { conferirDocumentoDaLoja, estadoDosLinks } from "@/lib/bio/conferir";
import { documentoBio, documentoPadrao } from "@/lib/bio/documento";
import {
  campanhasDaLoja,
  lojaDoPainel,
  motivoDoSlug,
  resposta,
  sugerirSlug,
  type ErroDoPainelBio,
  type RespostaDoPainelBio,
} from "@/lib/bio/painel-api";
import { getPublicSiteUrl } from "@/lib/brand";
import { criarPaginaDaLoja, lerPaginaDaLoja, salvarPaginaDaLoja, type PaginaBio } from "@/lib/stores/bio-pages";
import { getCustomDomain } from "@/lib/stores/custom-domains";
import { getOrganizationProfile } from "@/lib/stores/organization-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function falhou(acao: string, tenantId: string, e: unknown, mensagem: string): Response {
  console.error(`[api/link-da-bio] ${acao} ${tenantId}: ${(e as Error).message}`);
  return resposta({ error: mensagem } satisfies ErroDoPainelBio, 500);
}

/**
 * GET /api/link-da-bio — tudo que o editor precisa para abrir (spec §9): a página (ou `null`), as
 * campanhas com o slug do link mestre, o domínio próprio ativo, a origem Girumo (constante do
 * servidor, nunca o Host), a sugestão de endereço e os links que a página pública esconde.
 */
export async function GET(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "ler");
  if (loja instanceof Response) return loja;
  const { tenantId } = loja;
  try {
    const [pagina, dominio, campanhas, perfil] = await Promise.all([
      lerPaginaDaLoja(tenantId),
      getCustomDomain(tenantId),
      campanhasDaLoja(tenantId),
      getOrganizationProfile(tenantId),
    ]);
    const linksEscondidos = pagina ? (await estadoDosLinks(tenantId, pagina.documento)).linksEscondidos : [];
    // Com página, a sugestão é o próprio slug (nada a consultar); sem, um endereço livre.
    const sugestaoSlug = pagina ? pagina.slug : await sugerirSlug(perfil.storeName, tenantId);
    const corpo: RespostaDoPainelBio = {
      pagina,
      campanhas,
      dominio: dominio?.status === "active" ? dominio.hostname : null,
      origemGirumo: getPublicSiteUrl(),
      sugestaoSlug,
      linksEscondidos,
    };
    return resposta(corpo, 200);
  } catch (e) {
    return falhou("GET", tenantId, e, "Não deu pra carregar o link da bio.");
  }
}

/**
 * POST /api/link-da-bio — "Criar minha página" (spec §8, primeira vez). Idempotente: com página,
 * devolve a que existe. Nasce fora do ar, no modelo padrão, com o nome da loja, o link mestre da
 * primeira campanha que tem um (a mais recente, ordem de `listCampaignGroups`) e um endereço livre.
 */
export async function POST(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "editar");
  if (loja instanceof Response) return loja;
  const { tenantId } = loja;
  try {
    const existente = await lerPaginaDaLoja(tenantId);
    if (existente) return resposta(existente, 201);
    const [perfil, campanhas] = await Promise.all([getOrganizationProfile(tenantId), campanhasDaLoja(tenantId)]);
    const campanhaId = campanhas.find((c) => c.slug !== null)?.id ?? null;
    // O nome vai cru: o `documentoPadrao` apara, corta em 60 sem partir emoji e troca vazio por "Minha loja".
    const documento = documentoPadrao({ nome: perfil.storeName, campanhaId });
    // Dois cliques ao mesmo tempo: o segundo insert cai no unique de loja e o store devolve a mesma.
    const criada = await criarPaginaDaLoja(tenantId, await sugerirSlug(perfil.storeName, tenantId), documento);
    return resposta(criada, 201);
  } catch (e) {
    return falhou("POST", tenantId, e, "Não deu pra criar a página.");
  }
}

/** Envelope do PATCH. O documento é validado à parte, para o `campo` sair relativo a ele ("links.2.numero"). */
const corpoDoPatch = z.strictObject({
  // `bio_pages.versao` é integer e o store grava `versao + 1`: acima disso o Postgres daria 22003 (500).
  versao: z.number().int().positive().max(2147483646),
  slug: z.string(),
  publicada: z.boolean(),
  documento: z.unknown(),
});

const ERRO_DO_SLUG = {
  formato: "Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento.",
  reservado: "Esse endereço é reservado. Escolha outro.",
} as const;
const ERRO_409 = {
  // Texto da spec §8: o painel mostra igual, com o botão Recarregar.
  versao: "Outra pessoa salvou antes. Recarregue pra ver a versão nova.",
  slug: "Esse endereço já está em uso. Escolha outro.",
} as const;
const SEM_PAGINA = "Crie a página antes de salvar.";

/** "links.2.numero"; caminho vazio vira `raiz` (ou some do corpo). */
function campoDo(error: z.ZodError, raiz?: string): string | undefined {
  return error.issues[0]?.path.map(String).join(".") || raiz;
}

function recusa(error: string, status: number, extra: Omit<ErroDoPainelBio, "error"> = {}): Response {
  return resposta({ error, ...extra } satisfies ErroDoPainelBio, status);
}

/**
 * Slug novo e antigo (spec §6): o antigo passa a responder 301; o novo pode ter um 404 guardado.
 * Falha aqui não desfaz o salvar, que já está gravado: a página pública atualiza quando o cache
 * vencer (5 min). Responder 500 faria o painel achar que não salvou — e o próximo salvar daria 409.
 */
function invalidar(tenantId: string, pagina: PaginaBio, slugAntigo: string): void {
  try {
    invalidarBio({ tenantId, paginaId: pagina.id, slugs: [pagina.slug, slugAntigo] });
  } catch (e) {
    console.error(`[api/link-da-bio] invalidar ${tenantId}: ${(e as Error).message}`);
  }
}

/**
 * PATCH /api/link-da-bio — salvar (spec §8–§9). Ordem: envelope, documento (`documentoBio`) e slug
 * (formato, reservado) → `conferirDocumentoDaLoja` → `salvarPaginaDaLoja` (trava por `versao`) →
 * `invalidarBio` com o slug novo e o antigo.
 */
export async function PATCH(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "editar");
  if (loja instanceof Response) return loja;
  const { tenantId } = loja;

  const envelope = corpoDoPatch.safeParse(await req.json().catch(() => undefined));
  if (!envelope.success) return recusa("Pedido inválido.", 400, { campo: campoDo(envelope.error) });
  const lido = documentoBio.safeParse(envelope.data.documento);
  if (!lido.success) {
    return recusa(lido.error.issues[0]?.message ?? "Documento inválido.", 400, { campo: campoDo(lido.error, "documento") });
  }
  const { versao, slug, publicada } = envelope.data;
  const slugRuim = motivoDoSlug(slug);
  if (slugRuim) return recusa(ERRO_DO_SLUG[slugRuim], 400, { campo: "slug" });

  try {
    // Lida antes só pelo slug antigo: se o UPDATE condicional por versão passar, era este o slug trocado.
    const atual = await lerPaginaDaLoja(tenantId);
    if (!atual) return recusa(SEM_PAGINA, 404);
    const conferido = await conferirDocumentoDaLoja(tenantId, lido.data);
    if (!conferido.ok) return recusa(conferido.error, 400, { campo: conferido.campo });
    const salvo = await salvarPaginaDaLoja(tenantId, { versao, slug, publicada, documento: lido.data });
    if (!salvo.ok) {
      return salvo.motivo === "sem-pagina"
        ? recusa(SEM_PAGINA, 404)
        : recusa(ERRO_409[salvo.motivo], 409, { motivo: salvo.motivo });
    }
    invalidar(tenantId, salvo.pagina, atual.slug);
    return resposta(salvo.pagina, 200);
  } catch (e) {
    return falhou("PATCH", tenantId, e, "Não deu pra salvar a página.");
  }
}
